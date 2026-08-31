import type { MediaInsert } from '../db/schema';
import type { AccessibilityContext, AccessibilityReport, MediaProvider, OEmbedResponse } from './providers/types';
import { eq } from 'drizzle-orm';
import { batches, media, mediaGroupItems, tokenMediaUsage, tokens } from '../db/schema';
import { useDb } from '../utils/db';
import { filterAvailableMediaItems } from '../utils/mediaAvailability';
import { createVimeoProvider } from './providers/vimeo';

const providers = new Map<string, MediaProvider<any>>();

function getProviders(): Map<string, MediaProvider<any>> {
  if (providers.size === 0) {
    const config = useRuntimeConfig();
    const vimeo = createVimeoProvider(config.vimeoApiToken);
    providers.set('vimeo', vimeo);
  }
  return providers;
}

export function getMediaFromDb() {
  const db = useDb();
  return db.select().from(media).orderBy(media.createdAt);
}

export async function getMediaById(id: string) {
  const db = useDb();
  const rows = await db.select().from(media).where(eq(media.id, id));
  return rows[0] ?? null;
}

export async function createMedia(data: MediaInsert) {
  const db = useDb();
  await db.insert(media).values({
    id: data.id,
    title: data.title,
    providerConfig: data.providerConfig,
    createdAt: new Date(),
  });
  return data;
}

export interface MediaDeletion {
  deletedTokens: number
  deletedBatches: number
  /**
   * Groups the media was part of. Their tokens survive and keep working, they
   * just lead to one media less from now on.
   */
  removedFromGroups: number
}

/**
 * Everything referencing the media row goes first — its own tokens and
 * batches, plus the per-media counters and group memberships a group token
 * left behind. All of it shares one transaction: a half-finished delete would
 * leave rows pointing at media that no longer exists.
 */
export async function deleteMedia(id: string): Promise<MediaDeletion | null> {
  const existing = await getMediaById(id);
  if (!existing) {
    return null;
  }
  const db = useDb();
  const deleted = db.transaction((tx) => {
    tx.delete(tokenMediaUsage).where(eq(tokenMediaUsage.mediaId, id)).run();
    const removedFromGroups = tx.delete(mediaGroupItems).where(eq(mediaGroupItems.mediaId, id)).run().changes;
    const deletedTokens = tx.delete(tokens).where(eq(tokens.mediaId, id)).run().changes;
    const deletedBatches = tx.delete(batches).where(eq(batches.mediaId, id)).run().changes;
    tx.delete(media).where(eq(media.id, id)).run();
    return { deletedTokens, deletedBatches, removedFromGroups };
  });
  forgetAccessibility(id);
  return deleted;
}

export async function listMediaFromProvider(providerId: string) {
  const prov = getProviders().get(providerId);
  if (!prov) {
    return [];
  }
  return prov.listMedia();
}

/**
 * Provider media that has no media row yet, i.e. what an admin can still add.
 */
export async function listAvailableMediaFromProvider(providerId: string) {
  const items = await listMediaFromProvider(providerId);
  if (items.length === 0) {
    return items;
  }
  const existing = await getMediaFromDb();
  return filterAvailableMediaItems(
    items,
    existing.map(row => row.providerConfig),
  );
}

export interface ViewableMedia {
  title: string
  embed: OEmbedResponse
}

/**
 * The embed plus the title an admin gave the media, so a visitor can tell what
 * they are about to watch instead of just seeing a bare player.
 */
export async function getViewableMedia(mediaId: string): Promise<ViewableMedia | null> {
  const mediaRow = await getMediaById(mediaId);
  if (!mediaRow) {
    return null;
  }
  const prov = getProviders().get(mediaRow.providerConfig.providerId);
  if (!prov) {
    return null;
  }
  return {
    title: mediaRow.title,
    embed: await prov.getViewableContent(mediaRow.providerConfig),
  };
}

/**
 * Playback checks hit the provider's API two or three times, so results are
 * reused briefly. Admins can force a fresh check from the media page.
 */
const ACCESSIBILITY_CACHE_TTL_MS = 5 * 60 * 1000;
const accessibilityCache = new Map<string, { report: AccessibilityReport, checkedAt: number }>();

export interface MediaAccessibility {
  mediaId: string
  report: AccessibilityReport
  /** ISO timestamp of the check the report came from. */
  checkedAt: string
}

export async function verifyMediaAccessibility(
  mediaId: string,
  options?: { refresh?: boolean, context?: AccessibilityContext },
): Promise<MediaAccessibility | null> {
  const mediaRow = await getMediaById(mediaId);
  if (!mediaRow) {
    return null;
  }

  // The verdict depends on the host the app is served from, so a report cached
  // for one host must not be handed out for another.
  const cacheKey = `${mediaId}::${options?.context?.host ?? ''}`;
  const cached = accessibilityCache.get(cacheKey);
  if (!options?.refresh && cached && Date.now() - cached.checkedAt < ACCESSIBILITY_CACHE_TTL_MS) {
    return { mediaId, report: cached.report, checkedAt: new Date(cached.checkedAt).toISOString() };
  }

  const prov = getProviders().get(mediaRow.providerConfig.providerId);
  const report: AccessibilityReport = prov
    ? await runCheck(prov, mediaRow.providerConfig, options?.context)
    : { status: 'unknown', issues: [{ code: 'unknown_provider', severity: 'warning' }] };

  const checkedAt = Date.now();
  accessibilityCache.set(cacheKey, { report, checkedAt });
  return { mediaId, report, checkedAt: new Date(checkedAt).toISOString() };
}

/** Cache keys carry the host, so every host's entry for the media is dropped. */
function forgetAccessibility(mediaId: string) {
  for (const key of accessibilityCache.keys()) {
    if (key.startsWith(`${mediaId}::`)) {
      accessibilityCache.delete(key);
    }
  }
}

async function runCheck(
  prov: MediaProvider<any>,
  providerConfig: MediaInsert['providerConfig'],
  context?: AccessibilityContext,
): Promise<AccessibilityReport> {
  try {
    return await prov.verifyAccessibility(providerConfig, context);
  }
  catch (error) {
    console.error(`Accessibility check failed for provider ${prov.id}:`, error);
    return { status: 'unknown', issues: [{ code: 'check_failed', severity: 'warning' }] };
  }
}

/**
 * Each check makes up to three provider requests, so a large library would
 * otherwise fire hundreds of parallel calls and trip the provider's rate limit.
 */
const ACCESSIBILITY_CONCURRENCY = 5;

export async function verifyAllMediaAccessibility(
  context?: AccessibilityContext,
): Promise<MediaAccessibility[]> {
  const rows = await getMediaFromDb();
  const results: MediaAccessibility[] = [];
  for (let i = 0; i < rows.length; i += ACCESSIBILITY_CONCURRENCY) {
    const batch = rows.slice(i, i + ACCESSIBILITY_CONCURRENCY);
    const checked = await Promise.all(batch.map(row => verifyMediaAccessibility(row.id, { context })));
    results.push(...checked.filter((result): result is MediaAccessibility => result !== null));
  }
  return results;
}

export function getProviderSetupInstructionKeys(providerId: string): string[] {
  return getProviders().get(providerId)?.setupInstructionKeys ?? [];
}
