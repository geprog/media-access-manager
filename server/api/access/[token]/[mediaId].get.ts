import { openGroupMedia } from '../../../utils/publicAccess';

/**
 * One media of a group token. Opening it spends a view on this media alone,
 * unless that view would cost the visitor something — a limited view, or the
 * start of a validity running from first use. Then only a preview comes back
 * and the page asks before spending it through `[mediaId].post.ts`.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');
  const mediaId = getRouterParam(event, 'mediaId');
  if (!token || !mediaId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  return openGroupMedia(event, token, mediaId, { confirmed: false });
});
