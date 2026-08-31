import type { ViewableMedia } from '../services/mediaService';
import { getViewableMedia } from '../services/mediaService';

/**
 * The embed for a media whose token was already accepted. Any failure from
 * here on is a provider problem (video deleted, embedding disabled, API down)
 * and must not be reported to the visitor as an invalid link.
 */
export async function requireViewableMedia(mediaId: string): Promise<ViewableMedia> {
  let viewable: ViewableMedia | null;
  try {
    viewable = await getViewableMedia(mediaId);
  }
  catch (error) {
    console.error(`Failed to load embed content for media ${mediaId}:`, error);
    viewable = null;
  }
  if (!viewable) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Bad Gateway',
      data: { reason: 'media_unavailable' },
    });
  }
  return viewable;
}
