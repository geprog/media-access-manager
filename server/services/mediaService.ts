import type { MediaInsert } from '../db/schema';
import type { MediaProvider } from './providers/types';
import { eq } from 'drizzle-orm';
import { media } from '../db/schema';
import { useDb } from '../utils/db';
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

export async function listMediaFromProvider(providerId: string) {
  const prov = getProviders().get(providerId);
  if (!prov) {
    return [];
  }
  return prov.listMedia();
}

export async function getViewableContent(mediaId: string) {
  const mediaRow = await getMediaById(mediaId);
  if (!mediaRow) {
    return null;
  }
  const prov = getProviders().get(mediaRow.providerConfig.providerId);
  if (!prov) {
    return null;
  }
  return prov.getViewableContent(mediaRow.providerConfig);
}
