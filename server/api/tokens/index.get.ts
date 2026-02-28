import { listTokensByMediaId } from '../../services/tokenService';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const mediaId = query.mediaId as string;
  if (!mediaId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  return listTokensByMediaId(mediaId);
});
