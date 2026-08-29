import { getViewableContent } from '../../services/mediaService';
import { validateAndConsumeToken, validateToken } from '../../services/tokenService';

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
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      data: { reason: 'invalid_token' },
    });
  }
  // The token itself is fine from here on, so any failure below is a provider
  // problem (video deleted, embedding disabled, API down) and must not be
  // reported to the visitor as an invalid link.
  let embed: Awaited<ReturnType<typeof getViewableContent>>;
  try {
    embed = await getViewableContent(tokenRow.mediaId);
  }
  catch (error) {
    console.error(`Failed to load embed content for media ${tokenRow.mediaId}:`, error);
    embed = null;
  }
  if (!embed) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Bad Gateway',
      data: { reason: 'media_unavailable' },
    });
  }
  return embed;
});
