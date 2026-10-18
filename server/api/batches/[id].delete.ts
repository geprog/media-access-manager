import { deleteBatch } from '../../services/tokenService';

/** Deletes a batch with all its tokens, so their links and QR codes stop working. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const deleted = await deleteBatch(id);
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }
  return { id, ...deleted };
});
