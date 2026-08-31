import { getMediaGroupWithMedia } from '../../services/mediaGroupService';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const group = await getMediaGroupWithMedia(id);
  if (!group) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }
  return group;
});
