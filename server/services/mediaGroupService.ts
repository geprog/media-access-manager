import type { Media, MediaGroup } from '../db/schema';
import { asc, eq, inArray } from 'drizzle-orm';
import { batches, media, mediaGroupItems, mediaGroups, tokenMediaUsage, tokens } from '../db/schema';
import { generateId, useDb } from '../utils/db';

export interface MediaGroupSummary extends MediaGroup {
  mediaCount: number
}

export interface MediaGroupWithMedia {
  group: MediaGroup
  /** In the order the admin arranged them, which is the order visitors see. */
  media: Media[]
}

export async function listMediaGroups(): Promise<MediaGroupSummary[]> {
  const db = useDb();
  const groups = await db.select().from(mediaGroups).orderBy(mediaGroups.createdAt);
  if (groups.length === 0) {
    return [];
  }
  const items = await db
    .select({ groupId: mediaGroupItems.groupId })
    .from(mediaGroupItems)
    .where(inArray(mediaGroupItems.groupId, groups.map(group => group.id)));
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.groupId, (counts.get(item.groupId) ?? 0) + 1);
  }
  return groups.map(group => ({ ...group, mediaCount: counts.get(group.id) ?? 0 }));
}

export async function getMediaGroupById(id: string): Promise<MediaGroup | null> {
  const db = useDb();
  const rows = await db.select().from(mediaGroups).where(eq(mediaGroups.id, id));
  return rows[0] ?? null;
}

/** The media of a group, joined so a caller gets titles rather than bare ids. */
export async function listGroupMedia(groupId: string): Promise<Media[]> {
  const db = useDb();
  const rows = await db
    .select({ media })
    .from(mediaGroupItems)
    .innerJoin(media, eq(media.id, mediaGroupItems.mediaId))
    .where(eq(mediaGroupItems.groupId, groupId))
    .orderBy(asc(mediaGroupItems.position));
  return rows.map(row => row.media);
}

export async function getMediaGroupWithMedia(id: string): Promise<MediaGroupWithMedia | null> {
  const group = await getMediaGroupById(id);
  if (!group) {
    return null;
  }
  return { group, media: await listGroupMedia(id) };
}

/**
 * Keeps only ids that exist and drops duplicates, so a group can never point
 * at media that was deleted in the meantime.
 */
async function resolveMediaIds(mediaIds: string[]): Promise<string[]> {
  const wanted = [...new Set(mediaIds)];
  if (wanted.length === 0) {
    return [];
  }
  const db = useDb();
  const rows = await db.select({ id: media.id }).from(media).where(inArray(media.id, wanted));
  const known = new Set(rows.map(row => row.id));
  return wanted.filter(id => known.has(id));
}

export async function createMediaGroup(name: string, mediaIds: string[]): Promise<MediaGroup> {
  const db = useDb();
  const id = generateId();
  const createdAt = new Date();
  const members = await resolveMediaIds(mediaIds);
  db.transaction((tx) => {
    tx.insert(mediaGroups).values({ id, name, createdAt }).run();
    members.forEach((mediaId, position) => {
      tx.insert(mediaGroupItems).values({ groupId: id, mediaId, position }).run();
    });
  });
  return { id, name, createdAt };
}

/**
 * Replacing the membership keeps the group's tokens working: they point at the
 * group, so a media added later is reachable through links already handed out,
 * and one removed later simply drops off the visitor's list.
 *
 * Counts in `tokenMediaUsage` are deliberately left alone. A media taken out
 * and put back is the same media, and those views really were spent — dropping
 * them would hand every token a fresh budget for free.
 */
export async function updateMediaGroup(
  id: string,
  data: { name?: string, mediaIds?: string[] },
): Promise<MediaGroup | null> {
  const existing = await getMediaGroupById(id);
  if (!existing) {
    return null;
  }
  const members = data.mediaIds ? await resolveMediaIds(data.mediaIds) : null;
  const db = useDb();
  const name = data.name ?? existing.name;
  db.transaction((tx) => {
    if (data.name !== undefined) {
      tx.update(mediaGroups).set({ name }).where(eq(mediaGroups.id, id)).run();
    }
    if (members) {
      tx.delete(mediaGroupItems).where(eq(mediaGroupItems.groupId, id)).run();
      members.forEach((mediaId, position) => {
        tx.insert(mediaGroupItems).values({ groupId: id, mediaId, position }).run();
      });
    }
  });
  return { ...existing, name };
}

export interface MediaGroupDeletion {
  deletedTokens: number
  deletedBatches: number
}

/**
 * Everything hanging off the group goes with it — per-media usage first, then
 * the tokens that own it, so no row is ever left pointing at a gone parent.
 */
export async function deleteMediaGroup(id: string): Promise<MediaGroupDeletion | null> {
  const existing = await getMediaGroupById(id);
  if (!existing) {
    return null;
  }
  const db = useDb();
  const groupTokenIds = (await db
    .select({ id: tokens.id })
    .from(tokens)
    .where(eq(tokens.groupId, id))).map(row => row.id);
  return db.transaction((tx) => {
    if (groupTokenIds.length > 0) {
      tx.delete(tokenMediaUsage).where(inArray(tokenMediaUsage.tokenId, groupTokenIds)).run();
    }
    const deletedTokens = tx.delete(tokens).where(eq(tokens.groupId, id)).run().changes;
    const deletedBatches = tx.delete(batches).where(eq(batches.groupId, id)).run().changes;
    tx.delete(mediaGroupItems).where(eq(mediaGroupItems.groupId, id)).run();
    tx.delete(mediaGroups).where(eq(mediaGroups.id, id)).run();
    return { deletedTokens, deletedBatches };
  });
}

/** Group names a media belongs to, so deleting it can say what it affects. */
export async function listGroupsContainingMedia(mediaId: string): Promise<MediaGroup[]> {
  const db = useDb();
  const rows = await db
    .select({ group: mediaGroups })
    .from(mediaGroupItems)
    .innerJoin(mediaGroups, eq(mediaGroups.id, mediaGroupItems.groupId))
    .where(eq(mediaGroupItems.mediaId, mediaId))
    .orderBy(mediaGroups.createdAt);
  return rows.map(row => row.group);
}
