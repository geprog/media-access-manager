import { deleteMediaGroup } from '../../services/mediaGroupService';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const deleted = await deleteMediaGroup(id);
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }
  return { id, ...deleted };
});
