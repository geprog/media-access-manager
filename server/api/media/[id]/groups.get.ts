import { listGroupsContainingMedia } from '../../../services/mediaGroupService';

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  return listGroupsContainingMedia(id);
});
