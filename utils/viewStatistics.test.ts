import { describe, expect, it } from 'vitest';
import { fillBuckets, getBucketKey, getStatisticsRange } from './viewStatistics';

// A Sunday afternoon, written in local time so the ranges below are local too.
const NOW = new Date(2026, 9, 18, 15, 30);

describe('getStatisticsRange', () => {
  it('covers the last seven whole days up to now, bucketed per day', () => {
    const range = getStatisticsRange('7d', NOW);
    expect(range.from).toEqual(new Date(2026, 9, 12, 0, 0));
    expect(range.to).toEqual(NOW);
    expect(range.granularity).toBe('day');
  });

  it('counts today as one of the days', () => {
    expect(getStatisticsRange('30d', NOW).from).toEqual(new Date(2026, 8, 19, 0, 0));
    expect(getStatisticsRange('90d', NOW).from).toEqual(new Date(2026, 6, 21, 0, 0));
  });

  it('covers the last twelve whole months, bucketed per month', () => {
    const range = getStatisticsRange('12m', NOW);
    expect(range.from).toEqual(new Date(2025, 10, 1, 0, 0));
    expect(range.granularity).toBe('month');
  });
});

describe('getBucketKey', () => {
  it('names a day and a month in local time', () => {
    expect(getBucketKey(new Date(2026, 2, 5, 23, 59), 'day')).toBe('2026-03-05');
    expect(getBucketKey(new Date(2026, 2, 5, 23, 59), 'month')).toBe('2026-03');
  });
});

describe('fillBuckets', () => {
  it('lists every day of the range in order, with zero where nothing was viewed', () => {
    const range = getStatisticsRange('7d', NOW);
    const buckets = fillBuckets(range, { '2026-10-12': 2, '2026-10-18': 1 });
    expect(buckets.map(bucket => bucket.key)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(buckets.map(bucket => bucket.views)).toEqual([2, 0, 0, 0, 0, 0, 1]);
    expect(buckets[0]?.start).toEqual(new Date(2026, 9, 12));
  });

  it('lists every month of a yearly range', () => {
    const range = getStatisticsRange('12m', NOW);
    const buckets = fillBuckets(range, { '2026-01': 4 });
    expect(buckets).toHaveLength(12);
    expect(buckets[0]?.key).toBe('2025-11');
    expect(buckets.at(-1)?.key).toBe('2026-10');
    expect(buckets.find(bucket => bucket.key === '2026-01')?.views).toBe(4);
  });

  it('leaves out views that fall outside the range', () => {
    const range = getStatisticsRange('7d', NOW);
    const buckets = fillBuckets(range, { '2026-10-11': 5 });
    expect(buckets.every(bucket => bucket.views === 0)).toBe(true);
  });
});
