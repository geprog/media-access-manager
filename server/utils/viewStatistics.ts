import type { BucketGranularity } from '~/utils/viewStatistics';

/** A spent view as the statistics count it: who, what and when. */
export interface RecordedView {
  tokenId: string
  mediaId: string
  viewedAt: Date
}

export interface MediaViewSummary {
  mediaId: string
  views: number
  /** How many different tokens opened the media. */
  tokens: number
  lastViewedAt: Date
}

export interface ViewSummary {
  total: number
  /** How many different tokens spent a view. */
  tokens: number
  /** Views per bucket key (see `getBucketKeyInTimeZone`); buckets without views are left out. */
  buckets: Record<string, number>
  /** Most viewed first. */
  media: MediaViewSummary[]
}

export interface SummaryOptions {
  granularity: BucketGranularity
  /** The admin's time zone, which decides what "the same day" means. */
  timeZone: string
}

/**
 * The bucket a moment falls into, named `yyyy-mm-dd` (or `yyyy-mm`) in the
 * given time zone. Assembled from the date parts rather than a locale's
 * format, so the key is the same whatever locale the server runs with — and
 * the same the page computes for its local days.
 */
export function getBucketKeyInTimeZone(date: Date, granularity: BucketGranularity, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(entry => entry.type === type)?.value ?? '';
  const month = `${part('year')}-${part('month')}`;
  return granularity === 'month' ? month : `${month}-${part('day')}`;
}

/** Counts the views along the time axis and per media. */
export function summarizeViews(views: RecordedView[], options: SummaryOptions): ViewSummary {
  const buckets: Record<string, number> = {};
  const tokens = new Set<string>();
  const media = new Map<string, MediaViewSummary & { tokenIds: Set<string> }>();
  for (const view of views) {
    const key = getBucketKeyInTimeZone(view.viewedAt, options.granularity, options.timeZone);
    buckets[key] = (buckets[key] ?? 0) + 1;
    tokens.add(view.tokenId);
    const entry = media.get(view.mediaId)
      ?? { mediaId: view.mediaId, views: 0, tokens: 0, lastViewedAt: view.viewedAt, tokenIds: new Set<string>() };
    entry.views++;
    entry.tokenIds.add(view.tokenId);
    if (view.viewedAt > entry.lastViewedAt) {
      entry.lastViewedAt = view.viewedAt;
    }
    media.set(view.mediaId, entry);
  }
  return {
    total: views.length,
    tokens: tokens.size,
    buckets,
    media: [...media.values()]
      .map(({ tokenIds, ...entry }) => ({ ...entry, tokens: tokenIds.size }))
      .sort((a, b) => b.views - a.views || b.lastViewedAt.getTime() - a.lastViewedAt.getTime()),
  };
}

export interface StatisticsQuery extends SummaryOptions {
  from: Date
  to: Date
  /** Only this media's views, or every media's when `null`. */
  mediaId: string | null
}

/**
 * Whether the platform knows a time zone by that name. An unknown one is not
 * worth an error: the statistics are still right, only counted in UTC days.
 */
function isKnownTimeZone(timeZone: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  }
  catch {
    return false;
  }
}

function parseInstant(input: unknown): Date | null {
  if (typeof input !== 'string' || !input) {
    return null;
  }
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The statistics request's query string, or `null` when its range is missing
 * or malformed. The page sends the range as instants and names its time zone,
 * so the server never has to guess where the admin's day starts.
 */
export function parseStatisticsQuery(query: Record<string, unknown>): StatisticsQuery | null {
  const from = parseInstant(query.from);
  const to = parseInstant(query.to);
  if (!from || !to || from >= to) {
    return null;
  }
  const granularity = query.granularity ?? 'day';
  if (granularity !== 'day' && granularity !== 'month') {
    return null;
  }
  const timeZone = typeof query.timeZone === 'string' && isKnownTimeZone(query.timeZone) ? query.timeZone : 'UTC';
  const mediaId = typeof query.mediaId === 'string' && query.mediaId ? query.mediaId : null;
  return { from, to, granularity, timeZone, mediaId };
}
