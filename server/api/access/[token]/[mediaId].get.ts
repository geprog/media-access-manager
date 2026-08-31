import { consumeGroupMediaView, denialFor, resolveGroupMedia } from '../../../services/tokenService';
import { requireViewableMedia } from '../../../utils/publicAccess';

/**
 * One media of a group token. Reaching this endpoint is what spends a view,
 * and it spends it on this media alone — the token's other media keep their
 * own budget.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');
  const mediaId = getRouterParam(event, 'mediaId');
  if (!token || !mediaId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const session = await getUserSession(event);
  const user = session?.user as { role?: string } | undefined;
  const isAdmin = user?.role === 'admin';

  const resolved = await resolveGroupMedia(token, mediaId);
  if (!resolved) {
    // Unknown token, single-media token, or a media outside this token's
    // group: all a link that leads nowhere, and none of it worth explaining.
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      data: { reason: 'invalid_token', title: null, mediaId: null, groupId: null },
    });
  }
  if (resolved.blockedBy) {
    const denial = denialFor(resolved.token, resolved.blockedBy);
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      data: {
        reason: denial.reason,
        title: denial.reason === 'token_expired' ? resolved.media.title : null,
        // The token belongs to the group, so an admin checking it is sent
        // there rather than to the one media they happened to click.
        mediaId: null,
        groupId: isAdmin ? denial.groupId : null,
      },
    });
  }

  // The embed is fetched before the view is booked: a group token has a budget
  // per media, and losing one of a handful of views to a video that never
  // loaded would quietly eat access the visitor never got. A single-media
  // token has nothing to pick from and books first, as it always has.
  const viewable = await requireViewableMedia(resolved.media.id);
  // Admins previewing their own link must not use up a visitor's view.
  const usageCount = isAdmin
    ? resolved.usageCount
    : await consumeGroupMediaView(resolved.token, resolved.media.id);
  return {
    type: 'media' as const,
    title: viewable.title,
    embed: viewable.embed,
    access: {
      expiresAt: resolved.token.expiresAt?.toISOString() ?? null,
      usageLimit: resolved.token.usageLimit,
      usageCount,
    },
  };
});
