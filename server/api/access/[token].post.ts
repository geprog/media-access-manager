import { openMediaToken } from '../../utils/publicAccess';

/**
 * The visitor confirmed they want to watch now, so the view is spent — and on
 * a token whose validity starts on first use, its window opens.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  return openMediaToken(event, token, { confirmed: true });
});
