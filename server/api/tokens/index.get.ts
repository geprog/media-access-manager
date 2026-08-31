import { listTokensByBatchId, listTokensByGroupId, listTokensByMediaId } from '../../services/tokenService';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const mediaId = query.mediaId as string;
  const groupId = query.groupId as string;
  const batchId = query.batchId as string;

  if (batchId) {
    return listTokensByBatchId(batchId);
  }
  if (groupId) {
    return listTokensByGroupId(groupId);
  }
  if (!mediaId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  return listTokensByMediaId(mediaId);
});
