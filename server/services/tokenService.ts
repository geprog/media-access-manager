import type { Media, MediaGroup, Token } from '../db/schema';
import type { GroupMediaAccess } from '../utils/groupAccess';
import type { TokenInvalidReason } from '../utils/tokenValidation';
import { randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { batches, tokenMediaUsage, tokens } from '../db/schema';
import { generateId, useDb } from '../utils/db';
import { getGroupMediaAccess, getGroupWindowReason } from '../utils/groupAccess';
import { getTokenInvalidReason, isTokenValid } from '../utils/tokenValidation';
import { getMediaGroupById, listGroupMedia } from './mediaGroupService';

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

export async function validateAndConsumeToken(tokenValue: string): Promise<Token | null> {
  const tokenRow = await validateToken(tokenValue);
  if (!tokenRow) {
    return null;
  }
  const db = useDb();
  await db
    .update(tokens)
    .set({ usageCount: tokenRow.usageCount + 1 })
    .where(eq(tokens.id, tokenRow.id));
  return { ...tokenRow, usageCount: tokenRow.usageCount + 1 };
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

/**
 * Books one view of `mediaId` against a group token: the media's own counter
 * and, for the admin overview, the token's total. The upsert is what makes a
 * media's first view create its counter row.
 */
export async function consumeGroupMediaView(tokenRow: Token, mediaId: string): Promise<number> {
  const db = useDb();
  return db.transaction((tx) => {
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
    tx.update(tokens)
      .set({ usageCount: sql`${tokens.usageCount} + 1` })
      .where(eq(tokens.id, tokenRow.id))
      .run();
    return usageCount;
  });
}

export async function createToken(data: TokenTarget & {
  name: string
  batchId?: string
  startsAt?: Date
  expiresAt?: Date
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

export async function listTokensByGroupId(groupId: string) {
  const db = useDb();
  return db.select().from(tokens).where(eq(tokens.groupId, groupId));
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
