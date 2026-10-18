import { openGroupMedia } from '../../../utils/publicAccess';

/**
 * The visitor confirmed they want to watch this media of a group token now, so
 * its view is spent.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');
  const mediaId = getRouterParam(event, 'mediaId');
  if (!token || !mediaId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  return openGroupMedia(event, token, mediaId, { confirmed: true });
});
