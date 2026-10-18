import type { Media, MediaGroup, Token, TokenView } from '../db/schema';
import type { GroupMediaAccess } from '../utils/groupAccess';
import type { TokenSettingsChanges } from '../utils/tokenSettings';
import type { TokenInvalidReason } from '../utils/tokenValidation';
import type { ValidityDuration } from '~/utils/accessWindow';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, getTableColumns, gte, lte, sql } from 'drizzle-orm';
import { getEditedValidity } from '~/utils/accessWindow';
import { batches, media, mediaGroups, tokenMediaUsage, tokens, tokenViews } from '../db/schema';
import { generateId, useDb } from '../utils/db';
import { getGroupMediaAccess, getGroupWindowReason } from '../utils/groupAccess';
import { getTokenSettingsColumns } from '../utils/tokenSettings';
import { getActivationExpiry, getTokenInvalidReason, isTokenValid } from '../utils/tokenValidation';
import { getMediaGroupById, listGroupMedia } from './mediaGroupService';
import { getMediaById } from './mediaService';

export { getGroupWindowReason, isTokenValid };

/**
 * What a token unlocks: either one media or a whole group. Callers pass one or
 * the other; a token is never both.
 */
export type TokenTarget = { mediaId: string } | { groupId: string };

function targetColumns(target: TokenTarget) {
  return 'mediaId' in target
    ? { mediaId: target.mediaId, groupId: null }
    : { mediaId: null, groupId: target.groupId };
}

/**
 * Records a token's first view and, on a token whose validity starts then,
 * opens its date window. Both are only filled in while still empty, so of two
 * first views arriving at once the earlier one sets them and the later one
 * leaves them be.
 */
function activationColumns(tokenRow: Token, now: Date = new Date()) {
  const expiresAt = getActivationExpiry(tokenRow, now);
  return {
    firstUsedAt: sql`coalesce(${tokens.firstUsedAt}, ${toUnixSeconds(now)})`,
    ...(expiresAt ? { expiresAt: sql`coalesce(${tokens.expiresAt}, ${toUnixSeconds(expiresAt)})` } : {}),
  };
}

function toUnixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

function generateTokenString(): string {
  return randomBytes(16).toString('hex');
}

export async function findTokenByValue(tokenValue: string) {
  const db = useDb();
  const rows = await db.select().from(tokens).where(eq(tokens.token, tokenValue));
  return rows[0] ?? null;
}

/**
 * Validates a single-media token without incrementing usage. Group tokens are
 * turned down here: their limits are counted per media, so they can only be
 * judged together with the media the visitor picked.
 */
export async function validateToken(tokenValue: string): Promise<Token | null> {
  const tokenRow = await findTokenByValue(tokenValue);
  if (!tokenRow || !tokenRow.mediaId || !isTokenValid(tokenRow)) {
    return null;
  }
  return tokenRow;
}

/**
 * Why the public access endpoint turned a token down. A token whose access
 * window has closed — by date or by used-up views — is reported as
 * `token_expired`, because that visitor can ask for further access; an unknown
 * or not-yet-started token stays a plain invalid link.
 */
export type AccessDenialReason = 'token_expired' | 'invalid_token';

export interface AccessDenial {
  reason: AccessDenialReason
  /**
   * The media an expired token pointed at, so the page can still name the
   * video the visitor wanted. Stays `null` for a link that was never valid:
   * whoever holds it was never allowed to know what it leads to.
   */
  mediaId: string | null
  /** The same for a group token, which names a set of media rather than one. */
  groupId: string | null
}

export async function getAccessDenial(tokenValue: string): Promise<AccessDenial> {
  const tokenRow = await findTokenByValue(tokenValue);
  if (!tokenRow) {
    return { reason: 'invalid_token', mediaId: null, groupId: null };
  }
  return denialFor(tokenRow, getTokenInvalidReason(tokenRow));
}

/**
 * Turns the reason a token (or one media of a group token) is unusable into
 * what the public page may learn about it.
 */
export function denialFor(tokenRow: Token, reason: TokenInvalidReason | null): AccessDenial {
  const expired = reason === 'expired' || reason === 'usage_limit_reached';
  return expired
    ? { reason: 'token_expired', mediaId: tokenRow.mediaId, groupId: tokenRow.groupId }
    : { reason: 'invalid_token', mediaId: null, groupId: null };
}

/**
 * Books one view of a single-media token: its counter goes up and the view is
 * written to the history, in one transaction so the count and the history
 * behind it can never drift apart.
 */
export async function validateAndConsumeToken(tokenValue: string): Promise<Token | null> {
  const tokenRow = await validateToken(tokenValue);
  if (!tokenRow?.mediaId) {
    return null;
  }
  const mediaId = tokenRow.mediaId;
  const db = useDb();
  return db.transaction((tx) => {
    const now = new Date();
    const updated = tx
      .update(tokens)
      .set({ usageCount: sql`${tokens.usageCount} + 1`, ...activationColumns(tokenRow, now) })
      .where(eq(tokens.id, tokenRow.id))
      .returning()
      .get();
    recordView(tx, tokenRow.id, mediaId, now);
    return updated ?? null;
  });
}

type DbTransaction = Parameters<Parameters<ReturnType<typeof useDb>['transaction']>[0]>[0];

/**
 * Writes a spent view to the history. Only what the statistics and the
 * per-token history need — the token, the media and the moment — and nothing
 * about the visitor.
 */
function recordView(tx: DbTransaction, tokenId: string, mediaId: string, viewedAt: Date) {
  tx.insert(tokenViews).values({ id: generateId(), tokenId, mediaId, viewedAt }).run();
}

/** Views a group token already spent, keyed by media id. */
export async function getTokenUsageByMedia(tokenId: string): Promise<Map<string, number>> {
  const db = useDb();
  const rows = await db
    .select()
    .from(tokenMediaUsage)
    .where(eq(tokenMediaUsage.tokenId, tokenId));
  return new Map(rows.map(row => [row.mediaId, row.usageCount]));
}

export interface GroupMediaEntry extends GroupMediaAccess {
  media: Media
}

export interface GroupTokenAccess {
  token: Token
  group: MediaGroup
  /** Every media of the group, including the ones this token can no longer open. */
  media: GroupMediaEntry[]
}

/**
 * The whole group behind a token, with each media's own remaining access.
 * Looking at the list costs nothing — only opening a media spends a view.
 */
export async function getGroupTokenAccess(tokenValue: string): Promise<GroupTokenAccess | null> {
  const tokenRow = await findTokenByValue(tokenValue);
  if (!tokenRow?.groupId) {
    return null;
  }
  const group = await getMediaGroupById(tokenRow.groupId);
  if (!group) {
    return null;
  }
  const groupMedia = await listGroupMedia(group.id);
  const usage = await getTokenUsageByMedia(tokenRow.id);
  const access = getGroupMediaAccess(tokenRow, groupMedia.map(item => item.id), usage);
  return {
    token: tokenRow,
    group,
    media: groupMedia.map((item, index) => ({ ...access[index]!, media: item })),
  };
}

export interface GroupMediaResolution {
  token: Token
  media: Media
  blockedBy: TokenInvalidReason | null
  usageCount: number
}

/**
 * One media of a group token, resolved without consuming a view. `null` means
 * the token is unknown, is not a group token, or the media is not in its group
 * — all cases in which the visitor is simply holding a link that leads nowhere.
 */
export async function resolveGroupMedia(
  tokenValue: string,
  mediaId: string,
): Promise<GroupMediaResolution | null> {
  const access = await getGroupTokenAccess(tokenValue);
  const entry = access?.media.find(item => item.media.id === mediaId);
  if (!access || !entry) {
    return null;
  }
  return {
    token: access.token,
    media: entry.media,
    blockedBy: entry.blockedBy,
    usageCount: entry.usageCount,
  };
}

export interface GroupMediaView {
  /** Views this token has now spent on the media. */
  usageCount: number
  /** The token's expiry, which the very first view may just have set. */
  expiresAt: Date | null
}

/**
 * Books one view of `mediaId` against a group token: the media's own counter
 * and, for the admin overview, the token's total. The upsert is what makes a
 * media's first view create its counter row. The first view of any media is
 * also what starts a token whose validity runs from its first use.
 */
export async function consumeGroupMediaView(tokenRow: Token, mediaId: string): Promise<GroupMediaView> {
  const db = useDb();
  return db.transaction((tx) => {
    const now = new Date();
    const current = tx
      .select()
      .from(tokenMediaUsage)
      .where(and(eq(tokenMediaUsage.tokenId, tokenRow.id), eq(tokenMediaUsage.mediaId, mediaId)))
      .all()[0];
    const usageCount = (current?.usageCount ?? 0) + 1;
    if (current) {
      tx.update(tokenMediaUsage)
        .set({ usageCount })
        .where(and(eq(tokenMediaUsage.tokenId, tokenRow.id), eq(tokenMediaUsage.mediaId, mediaId)))
        .run();
    }
    else {
      tx.insert(tokenMediaUsage).values({ tokenId: tokenRow.id, mediaId, usageCount }).run();
    }
    const updated = tx.update(tokens)
      .set({ usageCount: sql`${tokens.usageCount} + 1`, ...activationColumns(tokenRow, now) })
      .where(eq(tokens.id, tokenRow.id))
      .returning({ expiresAt: tokens.expiresAt })
      .get();
    recordView(tx, tokenRow.id, mediaId, now);
    return { usageCount, expiresAt: updated?.expiresAt ?? tokenRow.expiresAt };
  });
}

export interface TokenViewEntry extends TokenView {
  /** The media's title at the time of reading, for a history an admin can read without looking ids up. */
  mediaTitle: string
}

export interface TokenViewHistory {
  token: Token
  /** The media or group the token unlocks, by name. */
  targetTitle: string | null
  /** Newest first. */
  views: TokenViewEntry[]
}

/**
 * Everything an admin needs when a visitor asks where their views went: the
 * token as it stands, and every view it spent, with the media each one opened.
 * Views spent before the history existed are not in it — `usageCount` still
 * counts them, so a count above the number of views means exactly that.
 */
export async function getTokenViewHistory(tokenId: string): Promise<TokenViewHistory | null> {
  const db = useDb();
  const tokenRow = (await db.select().from(tokens).where(eq(tokens.id, tokenId)))[0];
  if (!tokenRow) {
    return null;
  }
  const views = await db
    .select({ ...getTableColumns(tokenViews), mediaTitle: media.title })
    .from(tokenViews)
    .innerJoin(media, eq(media.id, tokenViews.mediaId))
    .where(eq(tokenViews.tokenId, tokenId))
    .orderBy(...newestViewFirst());
  let targetTitle: string | null = null;
  if (tokenRow.mediaId) {
    targetTitle = (await getMediaById(tokenRow.mediaId))?.title ?? null;
  }
  else if (tokenRow.groupId) {
    targetTitle = (await getMediaGroupById(tokenRow.groupId))?.name ?? null;
  }
  return { token: tokenRow, targetTitle, views };
}

/**
 * Views are stamped in whole seconds, so two spent within the same second
 * fall back to the order they were written in rather than to their random ids.
 */
function newestViewFirst() {
  return [desc(tokenViews.viewedAt), desc(sql`${tokenViews}.rowid`)];
}

function viewsBetween(from: Date, to: Date, mediaId: string | null) {
  return and(
    gte(tokenViews.viewedAt, from),
    lte(tokenViews.viewedAt, to),
    ...(mediaId ? [eq(tokenViews.mediaId, mediaId)] : []),
  );
}

/** The views spent in a period, for counting; only one media's when `mediaId` is set. */
export async function listViewsBetween(from: Date, to: Date, mediaId: string | null = null) {
  const db = useDb();
  return db
    .select({ tokenId: tokenViews.tokenId, mediaId: tokenViews.mediaId, viewedAt: tokenViews.viewedAt })
    .from(tokenViews)
    .where(viewsBetween(from, to, mediaId));
}

/**
 * The latest views of a period, each with the media it opened and the token
 * that spent it — by name, value and batch, the way the admin UI lists tokens,
 * so a view can be traced back to the batch it was handed out in.
 */
export async function listRecentViews(from: Date, to: Date, mediaId: string | null, limit: number) {
  const db = useDb();
  return db
    .select({
      id: tokenViews.id,
      viewedAt: tokenViews.viewedAt,
      mediaId: tokenViews.mediaId,
      mediaTitle: media.title,
      tokenId: tokens.id,
      tokenName: tokens.name,
      token: tokens.token,
      batchId: tokens.batchId,
      batchName: batches.name,
      groupId: tokens.groupId,
      groupName: mediaGroups.name,
    })
    .from(tokenViews)
    .innerJoin(media, eq(media.id, tokenViews.mediaId))
    .innerJoin(tokens, eq(tokens.id, tokenViews.tokenId))
    .leftJoin(batches, eq(batches.id, tokens.batchId))
    .leftJoin(mediaGroups, eq(mediaGroups.id, tokens.groupId))
    .where(viewsBetween(from, to, mediaId))
    .orderBy(...newestViewFirst())
    .limit(limit);
}

export async function createToken(data: TokenTarget & {
  name: string
  batchId?: string
  startsAt?: Date
  expiresAt?: Date
  validFor?: ValidityDuration
  usageLimit?: number
}) {
  const db = useDb();
  const id = generateId();
  const token = generateTokenString();
  const target = targetColumns(data);
  await db.insert(tokens).values({
    id,
    token,
    ...target,
    batchId: data.batchId ?? null,
    name: data.name,
    startsAt: data.startsAt ?? null,
    expiresAt: data.expiresAt ?? null,
    validFor: data.validFor ?? null,
    usageLimit: data.usageLimit ?? null,
    usageCount: 0,
    createdAt: new Date(),
  });
  return { id, token, ...target };
}

export async function createBatch(target: TokenTarget, count: number, options?: {
  name: string
  startsAt?: Date
  expiresAt?: Date
  validFor?: ValidityDuration
  usageLimit?: number
}) {
  const db = useDb();
  const batchId = generateId();
  const batchName = options?.name ?? '';
  const now = new Date();
  const columns = targetColumns(target);
  await db.insert(batches).values({
    id: batchId,
    ...columns,
    name: batchName,
    createdAt: now,
  });
  const tokenRows: Array<{ id: string, token: string }> = [];
  for (let i = 0; i < count; i++) {
    const id = generateId();
    const token = generateTokenString();
    const tokenName = String(i + 1); // Token index as name (1, 2, 3, ...)
    tokenRows.push({ id, token });
    await db.insert(tokens).values({
      id,
      token,
      ...columns,
      batchId,
      name: tokenName,
      startsAt: options?.startsAt ?? null,
      expiresAt: options?.expiresAt ?? null,
      validFor: options?.validFor ?? null,
      usageLimit: options?.usageLimit ?? null,
      usageCount: 0,
      createdAt: now,
    });
  }
  return { batchId, tokens: tokenRows.map(row => ({ ...row, ...columns })) };
}

export async function listTokensByMediaId(mediaId: string) {
  const db = useDb();
  return db.select().from(tokens).where(eq(tokens.mediaId, mediaId));
}

/**
 * A group's tokens, each with the most views it spent on any one media of the
 * group: the per-media limit is measured against that, not the total.
 */
export async function listTokensByGroupId(groupId: string) {
  const db = useDb();
  const usage = db
    .select({
      tokenId: tokenMediaUsage.tokenId,
      maxUsageCount: sql<number>`max(${tokenMediaUsage.usageCount})`.as('max_usage_count'),
    })
    .from(tokenMediaUsage)
    .groupBy(tokenMediaUsage.tokenId)
    .as('usage');
  return db
    .select({
      ...getTableColumns(tokens),
      maxMediaUsageCount: sql<number>`coalesce(${usage.maxUsageCount}, 0)`,
    })
    .from(tokens)
    .leftJoin(usage, eq(usage.tokenId, tokens.id))
    .where(eq(tokens.groupId, groupId));
}

export async function listTokensByBatchId(batchId: string) {
  const db = useDb();
  return db.select().from(tokens).where(eq(tokens.batchId, batchId));
}

export async function findBatchById(batchId: string) {
  const db = useDb();
  const rows = await db.select().from(batches).where(eq(batches.id, batchId));
  return rows[0] ?? null;
}

export async function listBatchesByMediaId(mediaId: string) {
  const db = useDb();
  return db.select().from(batches).where(eq(batches.mediaId, mediaId));
}

export async function listBatchesByGroupId(groupId: string) {
  const db = useDb();
  return db.select().from(batches).where(eq(batches.groupId, groupId));
}

export interface BatchChanges extends TokenSettingsChanges {
  name?: string
}

/**
 * Renames a batch and changes the settings its tokens share. Views already
 * spent are kept, so a lowered limit can leave tokens used up at once. `null`
 * when there is no such batch.
 */
export async function updateBatch(batchId: string, changes: BatchChanges) {
  const db = useDb();
  return db.transaction((tx) => {
    const batch = tx.select().from(batches).where(eq(batches.id, batchId)).get();
    if (!batch) {
      return null;
    }
    if (changes.name !== undefined) {
      tx.update(batches).set({ name: changes.name }).where(eq(batches.id, batchId)).run();
    }
    if (changes.usageLimit !== undefined) {
      tx.update(tokens).set({ usageLimit: changes.usageLimit }).where(eq(tokens.batchId, batchId)).run();
    }
    const validity = changes.validity;
    if (validity) {
      if (validity.validFor) {
        // Each token already opened counts the duration from its own first view.
        const batchTokens = tx.select().from(tokens).where(eq(tokens.batchId, batchId)).all();
        for (const tokenRow of batchTokens) {
          tx.update(tokens).set(getEditedValidity(tokenRow, validity)).where(eq(tokens.id, tokenRow.id)).run();
        }
      }
      else {
        tx.update(tokens).set(validity).where(eq(tokens.batchId, batchId)).run();
      }
    }
    return tx.select().from(batches).where(eq(batches.id, batchId)).get() ?? null;
  });
}

/**
 * Changes the usage limit and validity of one token, the same way a batch edit
 * changes each of its tokens: views already spent are kept, and a new first-use
 * duration counts from the token's first view. `null` when there is no such
 * token.
 */
export async function updateToken(tokenId: string, changes: TokenSettingsChanges) {
  const db = useDb();
  return db.transaction((tx) => {
    const tokenRow = tx.select().from(tokens).where(eq(tokens.id, tokenId)).get();
    if (!tokenRow) {
      return null;
    }
    const columns = getTokenSettingsColumns(tokenRow, changes);
    if (Object.keys(columns).length === 0) {
      return tokenRow;
    }
    return tx.update(tokens).set(columns).where(eq(tokens.id, tokenId)).returning().get() ?? null;
  });
}
