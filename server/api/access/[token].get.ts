import { getViewableContent } from '../../services/mediaService';
import { validateAndConsumeToken } from '../../services/tokenService';

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const tokenRow = await validateAndConsumeToken(token);
  if (!tokenRow) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const embed = await getViewableContent(tokenRow.mediaId);
  if (!embed) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  return embed;
});
