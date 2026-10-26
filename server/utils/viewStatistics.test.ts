import { describe, expect, it } from 'vitest';
import { getBucketKeyInTimeZone, parseStatisticsQuery, summarizeViews } from './viewStatistics';

function view(tokenId: string, mediaId: string, viewedAt: string) {
  return { tokenId, mediaId, viewedAt: new Date(viewedAt) };
}

describe('getBucketKeyInTimeZone', () => {
  it('names the day in the given time zone, not the server\'s', () => {
    // 23:30 UTC is already the next day in Berlin.
    const late = new Date('2026-03-05T23:30:00.000Z');
    expect(getBucketKeyInTimeZone(late, 'day', 'UTC')).toBe('2026-03-05');
    expect(getBucketKeyInTimeZone(late, 'day', 'Europe/Berlin')).toBe('2026-03-06');
  });

  it('names the month the same way', () => {
    const newYear = new Date('2025-12-31T23:30:00.000Z');
    expect(getBucketKeyInTimeZone(newYear, 'month', 'UTC')).toBe('2025-12');
    expect(getBucketKeyInTimeZone(newYear, 'month', 'Europe/Berlin')).toBe('2026-01');
  });
});

describe('summarizeViews', () => {
  const views = [
    view('t1', 'a', '2026-10-01T10:00:00.000Z'),
    view('t1', 'a', '2026-10-01T11:00:00.000Z'),
    view('t2', 'a', '2026-10-03T09:00:00.000Z'),
    view('t2', 'b', '2026-10-03T09:30:00.000Z'),
  ];

  it('counts views, the tokens that spent them and the media they opened', () => {
    const summary = summarizeViews(views, { granularity: 'day', timeZone: 'UTC' });
    expect(summary.total).toBe(4);
    expect(summary.tokens).toBe(2);
    expect(summary.media).toHaveLength(2);
  });

  it('buckets the views per day, leaving out days without any', () => {
    const summary = summarizeViews(views, { granularity: 'day', timeZone: 'UTC' });
    expect(summary.buckets).toEqual({ '2026-10-01': 2, '2026-10-03': 2 });
  });

  it('ranks the media by views and remembers each one\'s last view', () => {
    const summary = summarizeViews(views, { granularity: 'day', timeZone: 'UTC' });
    expect(summary.media).toEqual([
      { mediaId: 'a', views: 3, tokens: 2, lastViewedAt: new Date('2026-10-03T09:00:00.000Z') },
      { mediaId: 'b', views: 1, tokens: 1, lastViewedAt: new Date('2026-10-03T09:30:00.000Z') },
    ]);
  });

  it('is empty for no views', () => {
    expect(summarizeViews([], { granularity: 'month', timeZone: 'UTC' })).toEqual({
      total: 0,
      tokens: 0,
      buckets: {},
      media: [],
    });
  });
});

describe('parseStatisticsQuery', () => {
  const from = '2026-10-01T00:00:00.000Z';
  const to = '2026-10-18T12:00:00.000Z';

  it('reads the range, the bucket size and the admin\'s time zone', () => {
    expect(parseStatisticsQuery({ from, to, granularity: 'month', timeZone: 'Europe/Berlin' })).toEqual({
      from: new Date(from),
      to: new Date(to),
      granularity: 'month',
      timeZone: 'Europe/Berlin',
      mediaId: null,
    });
  });

  it('buckets per day and uses UTC unless told otherwise', () => {
    expect(parseStatisticsQuery({ from, to })).toMatchObject({ granularity: 'day', timeZone: 'UTC' });
  });

  it('falls back to UTC for a time zone the server does not know', () => {
    expect(parseStatisticsQuery({ from, to, timeZone: 'Mars/Olympus_Mons' })?.timeZone).toBe('UTC');
  });

  it('narrows the statistics down to one media when asked', () => {
    expect(parseStatisticsQuery({ from, to, mediaId: 'abc' })?.mediaId).toBe('abc');
  });

  it('turns down a missing or malformed range', () => {
    expect(parseStatisticsQuery({})).toBeNull();
    expect(parseStatisticsQuery({ from: 'yesterday', to })).toBeNull();
    expect(parseStatisticsQuery({ from: to, to: from })).toBeNull();
    expect(parseStatisticsQuery({ from, to, granularity: 'week' })).toBeNull();
  });
});
