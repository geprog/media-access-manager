import { deleteToken } from '../../services/tokenService';

/**
 * Deletes a single token, so its link and QR code stop working. A batch losing
 * its last token goes with it.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const deleted = await deleteToken(id);
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }
  return { id, ...deleted };
});
