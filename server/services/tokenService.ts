import type { Token } from '../db/schema';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { batches, tokens } from '../db/schema';
import { useDb } from '../utils/db';
import { isTokenValid } from '../utils/tokenValidation';

export { isTokenValid };

function generateTokenString(): string {
  return randomBytes(16).toString('hex');
}

function generateId(): string {
  return randomBytes(12).toString('hex');
}

export async function findTokenByValue(tokenValue: string) {
  const db = useDb();
  const rows = await db.select().from(tokens).where(eq(tokens.token, tokenValue));
  return rows[0] ?? null;
}

export async function validateAndConsumeToken(tokenValue: string): Promise<Token | null> {
  const tokenRow = await findTokenByValue(tokenValue);
  if (!tokenRow || !isTokenValid(tokenRow)) {
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
  const now = new Date();
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
    createdAt: now,
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
