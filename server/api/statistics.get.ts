import { getMediaFromDb } from '../services/mediaService';
import { listRecentViews, listViewsBetween } from '../services/tokenService';
import { parseStatisticsQuery, summarizeViews } from '../utils/viewStatistics';

/** How many of the period's latest views are listed one by one. */
const RECENT_VIEWS_LIMIT = 50;

/**
 * The views spent in a period: counted along the time axis and per media, plus
 * the latest ones listed with the token that spent them. The page sends the
 * range as instants together with its time zone, so the days are the admin's
 * days, not the server's.
 */
export default defineEventHandler(async (event) => {
  const query = parseStatisticsQuery(getQuery(event));
  if (!query) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const { from, to, mediaId } = query;
  const [views, recent, allMedia] = await Promise.all([
    listViewsBetween(from, to, mediaId),
    listRecentViews(from, to, mediaId, RECENT_VIEWS_LIMIT),
    getMediaFromDb(),
  ]);
  const summary = summarizeViews(views, query);
  const titles = new Map(allMedia.map(row => [row.id, row.title]));
  return {
    ...summary,
    media: summary.media.map(entry => ({ ...entry, title: titles.get(entry.mediaId) ?? entry.mediaId })),
    recent,
    recentLimit: RECENT_VIEWS_LIMIT,
  };
});
