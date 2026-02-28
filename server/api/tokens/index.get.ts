import { listTokensByBatchId, listTokensByMediaId } from '../../services/tokenService';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const mediaId = query.mediaId as string;
  const batchId = query.batchId as string;

  if (batchId) {
    return listTokensByBatchId(batchId);
  }
  if (!mediaId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  return listTokensByMediaId(mediaId);
});
