import { randomBytes } from 'node:crypto';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';

// The service talks to whatever `useDb()` hands out, so an in-memory database
// with the real migrations applied stands in for the file on disk.
const sqlite = new Database(':memory:');
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: path.resolve(process.cwd(), 'server', 'db', 'migrations') });

vi.mock('../utils/db', () => ({
  useDb: () => db,
  generateId: () => randomBytes(12).toString('hex'),
}));

const {
  consumeGroupMediaView,
  createBatch,
  createToken,
  deleteBatch,
  deleteToken,
  findBatchById,
  findTokenByValue,
  getTokenViewHistory,
  listRecentViews,
  listTokensByBatchId,
  listViewsBetween,
  validateAndConsumeToken,
} = await import('./tokenService');
const { createMedia, deleteMedia } = await import('./mediaService');
const { createMediaGroup, deleteMediaGroup } = await import('./mediaGroupService');

function countRows(table: 'token_views' | 'token_media_usage' | 'tokens'): number {
  return (sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
}

function countViews(): number {
  return countRows('token_views');
}

let counter = 0;

async function someMedia(title = `Video ${++counter}`) {
  const id = randomBytes(12).toString('hex');
  await createMedia({ id, title, providerConfig: { providerId: 'vimeo', videoId: String(counter) } });
  return id;
}

beforeEach(() => {
  for (const table of ['token_views', 'token_media_usage', 'tokens', 'batches', 'media_group_items', 'media_groups', 'media']) {
    sqlite.prepare(`DELETE FROM ${table}`).run();
  }
});

describe('spending a view', () => {
  it('records which media a single-media token opened, and when', async () => {
    const mediaId = await someMedia();
    const { id, token } = await createToken({ mediaId, name: 'one' });
    const before = Math.floor(Date.now() / 1000) * 1000;

    await validateAndConsumeToken(token);
    await validateAndConsumeToken(token);

    const history = await getTokenViewHistory(id);
    expect(history?.token.usageCount).toBe(2);
    expect(history?.views).toHaveLength(2);
    expect(history?.views.every(view => view.mediaId === mediaId)).toBe(true);
    expect(history?.views[0]?.viewedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('records the media picked from a group, and starts the token at that moment', async () => {
    const [first, second] = [await someMedia('First'), await someMedia('Second')];
    const group = await createMediaGroup('Workshop', [first, second]);
    const { id, token } = await createToken({ groupId: group.id, name: 'group', validFor: { days: 3 } });
    const tokenRow = (await findTokenByValue(token))!;

    await consumeGroupMediaView(tokenRow, second);

    const history = await getTokenViewHistory(id);
    expect(history?.views.map(view => view.mediaTitle)).toEqual(['Second']);
    // The first view is what started the token, so both carry the same moment.
    expect(history?.token.firstUsedAt).toEqual(history?.views[0]?.viewedAt);
  });

  it('leaves no trace for a token that may not be used', async () => {
    const mediaId = await someMedia();
    const { id, token } = await createToken({ mediaId, name: 'used up', usageLimit: 1 });

    await validateAndConsumeToken(token);
    await validateAndConsumeToken(token);

    expect((await getTokenViewHistory(id))?.views).toHaveLength(1);
  });
});

describe('getTokenViewHistory', () => {
  it('lists the views newest first and names what the token unlocks', async () => {
    const mediaId = await someMedia('Keynote');
    const { id, token } = await createToken({ mediaId, name: 'one' });
    await validateAndConsumeToken(token);
    sqlite.prepare('UPDATE token_views SET viewed_at = viewed_at - 3600').run();
    await validateAndConsumeToken(token);

    const history = await getTokenViewHistory(id);

    expect(history?.targetTitle).toBe('Keynote');
    const [newest, oldest] = history!.views;
    expect(newest!.viewedAt.getTime()).toBeGreaterThan(oldest!.viewedAt.getTime());
  });

  it('keeps views of the same second in the order they were spent', async () => {
    const mediaId = await someMedia();
    const { id, token } = await createToken({ mediaId, name: 'one' });
    await validateAndConsumeToken(token);
    await validateAndConsumeToken(token);
    const [first, second] = sqlite.prepare('SELECT id FROM token_views ORDER BY rowid').all() as Array<{ id: string }>;

    const history = await getTokenViewHistory(id);

    expect(history?.views.map(view => view.id)).toEqual([second!.id, first!.id]);
  });

  it('is `null` for a token that does not exist', async () => {
    expect(await getTokenViewHistory('nope')).toBeNull();
  });
});

describe('deleting what views point at', () => {
  it('takes the views of a media along with its tokens', async () => {
    const mediaId = await someMedia();
    const { token } = await createToken({ mediaId, name: 'one' });
    await validateAndConsumeToken(token);

    await deleteMedia(mediaId);

    expect(countViews()).toBe(0);
  });

  it('drops a group token\'s views of a deleted media, and its total with them', async () => {
    const [a, b] = [await someMedia('A'), await someMedia('B')];
    const group = await createMediaGroup('Workshop', [a, b]);
    const { id, token } = await createToken({ groupId: group.id, name: 'group' });
    const tokenRow = (await findTokenByValue(token))!;
    await consumeGroupMediaView(tokenRow, a);
    await consumeGroupMediaView(tokenRow, a);
    await consumeGroupMediaView(tokenRow, b);

    await deleteMedia(a);

    const history = await getTokenViewHistory(id);
    expect(history?.views.map(view => view.mediaTitle)).toEqual(['B']);
    // The total follows the history, so the dialog has no gap to explain.
    expect(history?.token.usageCount).toBe(1);
  });

  it('takes the views of a group along with its tokens', async () => {
    const mediaId = await someMedia();
    const group = await createMediaGroup('Workshop', [mediaId]);
    const { token } = await createToken({ groupId: group.id, name: 'group' });
    await consumeGroupMediaView((await findTokenByValue(token))!, mediaId);

    await deleteMediaGroup(group.id);

    expect(countViews()).toBe(0);
  });
});

describe('deleting batches and tokens', () => {
  it('deletes a batch with its tokens and their views, leaving other batches be', async () => {
    const mediaId = await someMedia();
    const doomed = await createBatch({ mediaId }, 2, { name: 'Test' });
    const kept = await createBatch({ mediaId }, 1, { name: 'Real' });
    await validateAndConsumeToken(doomed.tokens[0]!.token);
    await validateAndConsumeToken(kept.tokens[0]!.token);

    expect(await deleteBatch(doomed.batchId)).toEqual({ deletedTokens: 2 });

    expect(await findBatchById(doomed.batchId)).toBeNull();
    expect(await findTokenByValue(doomed.tokens[1]!.token)).toBeNull();
    expect(await listTokensByBatchId(kept.batchId)).toHaveLength(1);
    expect(countViews()).toBe(1);
  });

  it('deletes a group batch along with what its tokens spent per media', async () => {
    const mediaId = await someMedia();
    const group = await createMediaGroup('Workshop', [mediaId]);
    const { batchId, tokens } = await createBatch({ groupId: group.id }, 1, { name: 'Test' });
    await consumeGroupMediaView((await findTokenByValue(tokens[0]!.token))!, mediaId);

    await deleteBatch(batchId);

    expect(countRows('token_media_usage')).toBe(0);
    expect(countViews()).toBe(0);
  });

  it('is `null` for a batch that does not exist', async () => {
    expect(await deleteBatch('missing')).toBeNull();
  });

  it('deletes a single token with its views and keeps the rest of its batch', async () => {
    const mediaId = await someMedia();
    const { batchId, tokens } = await createBatch({ mediaId }, 2, { name: 'Mixed' });
    await validateAndConsumeToken(tokens[0]!.token);
    await validateAndConsumeToken(tokens[1]!.token);

    expect(await deleteToken(tokens[0]!.id)).toEqual({ deletedBatch: false });

    expect(await findTokenByValue(tokens[0]!.token)).toBeNull();
    expect((await listTokensByBatchId(batchId)).map(row => row.id)).toEqual([tokens[1]!.id]);
    expect(countViews()).toBe(1);
  });

  it('deletes a group token along with what it spent per media', async () => {
    const mediaId = await someMedia();
    const group = await createMediaGroup('Workshop', [mediaId]);
    const { id, token } = await createToken({ groupId: group.id, name: 'group' });
    await consumeGroupMediaView((await findTokenByValue(token))!, mediaId);

    await deleteToken(id);

    expect(countRows('token_media_usage')).toBe(0);
    expect(countViews()).toBe(0);
  });

  it('takes the batch along with its last token, which would only leave an empty batch', async () => {
    const mediaId = await someMedia();
    const { batchId, tokens } = await createBatch({ mediaId }, 1, { name: 'Single' });

    expect(await deleteToken(tokens[0]!.id)).toEqual({ deletedBatch: true });

    expect(await findBatchById(batchId)).toBeNull();
  });

  it('is `null` for a token that does not exist', async () => {
    expect(await deleteToken('missing')).toBeNull();
  });
});

describe('listing views for the statistics', () => {
  it('returns the views of a period, narrowed down to one media on request', async () => {
    const [a, b] = [await someMedia(), await someMedia()];
    const { token: tokenA } = await createToken({ mediaId: a, name: 'a' });
    const { token: tokenB } = await createToken({ mediaId: b, name: 'b' });
    await validateAndConsumeToken(tokenA);
    await validateAndConsumeToken(tokenB);
    // One view from long before the period.
    await validateAndConsumeToken(tokenA);
    sqlite.prepare('UPDATE token_views SET viewed_at = viewed_at - 86400 * 30 WHERE id = (SELECT id FROM token_views ORDER BY rowid DESC LIMIT 1)').run();

    const from = new Date(Date.now() - 86400 * 1000);
    const to = new Date(Date.now() + 60 * 1000);
    expect(await listViewsBetween(from, to)).toHaveLength(2);
    expect((await listViewsBetween(from, to, b)).map(view => view.mediaId)).toEqual([b]);
  });

  it('describes the latest views with their token, batch and media', async () => {
    const mediaId = await someMedia('Keynote');
    const { token } = await createToken({ mediaId, name: 'one' });
    await validateAndConsumeToken(token);

    const [latest] = await listRecentViews(new Date(0), new Date(Date.now() + 60 * 1000), null, 10);

    expect(latest).toMatchObject({ mediaTitle: 'Keynote', tokenName: 'one', token, batchName: null, groupName: null });
  });
});
