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
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const embed = await getViewableContent(tokenRow.mediaId);
  if (!embed) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  return embed;
});
