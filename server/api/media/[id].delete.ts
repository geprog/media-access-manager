import { deleteMedia } from '../../services/mediaService';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const deleted = await deleteMedia(id);
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }
  return { id, ...deleted };
});
