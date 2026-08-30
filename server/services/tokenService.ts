import type { Token } from '../db/schema';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { batches, tokens } from '../db/schema';
import { generateId, useDb } from '../utils/db';
import { getTokenInvalidReason, isTokenValid } from '../utils/tokenValidation';

export { isTokenValid };

function generateTokenString(): string {
  return randomBytes(16).toString('hex');
}

export async function findTokenByValue(tokenValue: string) {
  const db = useDb();
  const rows = await db.select().from(tokens).where(eq(tokens.token, tokenValue));
  return rows[0] ?? null;
}

/** Validates token without incrementing usage. Use for admin preview. */
export async function validateToken(tokenValue: string): Promise<Token | null> {
  const tokenRow = await findTokenByValue(tokenValue);
  if (!tokenRow || !isTokenValid(tokenRow)) {
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
}

export async function getAccessDenial(tokenValue: string): Promise<AccessDenial> {
  const tokenRow = await findTokenByValue(tokenValue);
  if (!tokenRow) {
    return { reason: 'invalid_token', mediaId: null };
  }
  const reason = getTokenInvalidReason(tokenRow);
  return reason === 'expired' || reason === 'usage_limit_reached'
    ? { reason: 'token_expired', mediaId: tokenRow.mediaId }
    : { reason: 'invalid_token', mediaId: null };
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

export async function createToken(data: {
  mediaId: string
  name: string
  batchId?: string
  startsAt?: Date
  expiresAt?: Date
  usageLimit?: number
}) {
  const db = useDb();
  const id = generateId();
  const token = generateTokenString();
  await db.insert(tokens).values({
    id,
    token,
    mediaId: data.mediaId,
    batchId: data.batchId ?? null,
    name: data.name,
    startsAt: data.startsAt ?? null,
    expiresAt: data.expiresAt ?? null,
    usageLimit: data.usageLimit ?? null,
    usageCount: 0,
    createdAt: new Date(),
  });
  return { id, token, mediaId: data.mediaId };
}

export async function createBatch(mediaId: string, count: number, options?: {
  name: string
  startsAt?: Date
  expiresAt?: Date
  usageLimit?: number
}) {
  const db = useDb();
  const batchId = generateId();
  const batchName = options?.name ?? '';
  const now = new Date();
  await db.insert(batches).values({
    id: batchId,
    mediaId,
    name: batchName,
    createdAt: now,
  });
  const tokenRows: Array<{ id: string, token: string, mediaId: string }> = [];
  for (let i = 0; i < count; i++) {
    const id = generateId();
    const token = generateTokenString();
    const tokenName = String(i + 1); // Token index as name (1, 2, 3, ...)
    tokenRows.push({ id, token, mediaId });
    await db.insert(tokens).values({
      id,
      token,
      mediaId,
      batchId,
      name: tokenName,
      startsAt: options?.startsAt ?? null,
      expiresAt: options?.expiresAt ?? null,
      usageLimit: options?.usageLimit ?? null,
      usageCount: 0,
      createdAt: now,
    });
  }
  return { batchId, tokens: tokenRows };
}

export async function listTokensByMediaId(mediaId: string) {
  const db = useDb();
  return db.select().from(tokens).where(eq(tokens.mediaId, mediaId));
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
