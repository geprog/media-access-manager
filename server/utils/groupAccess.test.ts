import { describe, expect, it } from 'vitest';
import { getGroupMediaAccess, getGroupWindowReason } from './groupAccess';

const OPEN_WINDOW = { startsAt: null, expiresAt: null, usageLimit: null };

describe('getGroupMediaAccess', () => {
  it('reports every media of the group, in the given order', () => {
    const access = getGroupMediaAccess(OPEN_WINDOW, ['a', 'b'], new Map());
    expect(access.map(entry => entry.mediaId)).toEqual(['a', 'b']);
    expect(access.every(entry => entry.blockedBy === null)).toBe(true);
  });

  it('spends the usage limit per media instead of once for the token', () => {
    const token = { ...OPEN_WINDOW, usageLimit: 2 };
    const usage = new Map([['a', 2], ['b', 1]]);

    const [first, second] = getGroupMediaAccess(token, ['a', 'b'], usage);

    expect(first?.blockedBy).toBe('usage_limit_reached');
    // 'b' keeps its own budget even though 'a' is used up.
    expect(second?.blockedBy).toBe(null);
  });

  it('treats media the token never opened as unused', () => {
    const token = { ...OPEN_WINDOW, usageLimit: 1 };

    const [entry] = getGroupMediaAccess(token, ['fresh'], new Map());

    expect(entry).toMatchObject({ usageCount: 0, blockedBy: null });
  });

  it('closes every media at once when the token expires', () => {
    const token = { ...OPEN_WINDOW, expiresAt: new Date('2026-01-01T00:00:00Z') };
    const now = new Date('2026-01-02T00:00:00Z');

    const access = getGroupMediaAccess(token, ['a', 'b'], new Map(), now);

    expect(access.map(entry => entry.blockedBy)).toEqual(['expired', 'expired']);
  });

  it('closes every media at once before the token starts', () => {
    const token = { ...OPEN_WINDOW, startsAt: new Date('2026-01-02T00:00:00Z') };
    const now = new Date('2026-01-01T00:00:00Z');

    const access = getGroupMediaAccess(token, ['a'], new Map(), now);

    expect(access[0]?.blockedBy).toBe('not_started');
  });
});

describe('getGroupWindowReason', () => {
  it('ignores the usage limit, which is a matter for the single media', () => {
    expect(getGroupWindowReason({ ...OPEN_WINDOW, usageLimit: 1 })).toBe(null);
  });

  it('closes once the token expired', () => {
    const token = { ...OPEN_WINDOW, expiresAt: new Date('2026-01-01T00:00:00Z') };
    expect(getGroupWindowReason(token, new Date('2026-01-02T00:00:00Z'))).toBe('expired');
  });

  it('closes before the token starts', () => {
    const token = { ...OPEN_WINDOW, startsAt: new Date('2026-01-02T00:00:00Z') };
    expect(getGroupWindowReason(token, new Date('2026-01-01T00:00:00Z'))).toBe('not_started');
  });
});
