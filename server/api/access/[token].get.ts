import { getMediaById, getViewableMedia } from '../../services/mediaService';
import { getAccessDenial, validateAndConsumeToken, validateToken } from '../../services/tokenService';

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const session = await getUserSession(event);
  const user = session?.user as { role?: string } | undefined;
  const isAdmin = user?.role === 'admin';
  const tokenRow = isAdmin
    ? await validateToken(token)
    : await validateAndConsumeToken(token);
  if (!tokenRow) {
    const denial = await getAccessDenial(token);
    const deniedMedia = denial.mediaId ? await getMediaById(denial.mediaId) : null;
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      data: {
        reason: denial.reason,
        title: deniedMedia?.title ?? null,
        // Admins check their own links here; the id sends them on to the media
        // instead of a support mail. Visitors have no use for it.
        mediaId: isAdmin ? denial.mediaId : null,
      },
    });
  }
  // The token itself is fine from here on, so any failure below is a provider
  // problem (video deleted, embedding disabled, API down) and must not be
  // reported to the visitor as an invalid link.
  let viewable: Awaited<ReturnType<typeof getViewableMedia>>;
  try {
    viewable = await getViewableMedia(tokenRow.mediaId);
  }
  catch (error) {
    console.error(`Failed to load embed content for media ${tokenRow.mediaId}:`, error);
    viewable = null;
  }
  if (!viewable) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Bad Gateway',
      data: { reason: 'media_unavailable' },
    });
  }
  return {
    title: viewable.title,
    embed: viewable.embed,
    // Only the limits of the visitor's own token, so they can see how much of
    // their access window is left. Nothing about the token's owner or batch.
    access: {
      expiresAt: tokenRow.expiresAt?.toISOString() ?? null,
      usageLimit: tokenRow.usageLimit,
      usageCount: tokenRow.usageCount,
    },
  };
});
