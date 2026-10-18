import { eachDayOfInterval, eachMonthOfInterval, format, startOfDay, startOfMonth, subDays, subMonths } from 'date-fns';

/** The spans of time an admin can look back over on the statistics page. */
export const STATISTICS_PERIODS = ['7d', '30d', '90d', '12m'] as const;

export type StatisticsPeriod = typeof STATISTICS_PERIODS[number];

/**
 * How finely views are counted along the time axis. A year of daily bars would
 * be unreadable, so a yearly range is counted per month.
 */
export type BucketGranularity = 'day' | 'month';

export interface StatisticsRange {
  from: Date
  to: Date
  granularity: BucketGranularity
}

const PERIOD_DAYS: Record<Exclude<StatisticsPeriod, '12m'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

/**
 * The range a period covers, in the admin's local time: whole days (or whole
 * months) up to now, today (or this month) included. "The last 7 days" is
 * today and the six before it, not seven times 24 hours.
 */
export function getStatisticsRange(period: StatisticsPeriod, now: Date = new Date()): StatisticsRange {
  if (period === '12m') {
    return { from: startOfMonth(subMonths(now, 11)), to: now, granularity: 'month' };
  }
  return { from: startOfDay(subDays(now, PERIOD_DAYS[period] - 1)), to: now, granularity: 'day' };
}

/**
 * The name of the bucket a moment falls into, in local time. The server names
 * its buckets the same way in the time zone the page sends along, so the two
 * sides meet on these keys.
 */
export function getBucketKey(date: Date, granularity: BucketGranularity): string {
  return format(date, granularity === 'day' ? 'yyyy-MM-dd' : 'yyyy-MM');
}

export interface ViewBucket {
  key: string
  /** When the bucket starts, for labeling it. */
  start: Date
  views: number
}

/**
 * Every bucket of the range in order, so a chart shows the quiet days as
 * empty slots rather than skipping them. The server only reports buckets with
 * views in them; the rest are filled in with zero here.
 */
export function fillBuckets(range: StatisticsRange, counts: Record<string, number>): ViewBucket[] {
  const interval = { start: range.from, end: range.to };
  const starts = range.granularity === 'day' ? eachDayOfInterval(interval) : eachMonthOfInterval(interval);
  return starts.map((start) => {
    const key = getBucketKey(start, range.granularity);
    return { key, start, views: counts[key] ?? 0 };
  });
}
