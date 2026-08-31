import { listBatchesByGroupId, listBatchesByMediaId, listTokensByBatchId } from '../../services/tokenService';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const mediaId = query.mediaId as string;
  const groupId = query.groupId as string;
  if (!mediaId && !groupId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const batchRows = groupId
    ? await listBatchesByGroupId(groupId)
    : await listBatchesByMediaId(mediaId);
  const batchesWithCount = await Promise.all(
    batchRows.map(async (b) => {
      const tokens = await listTokensByBatchId(b.id);
      return { ...b, count: tokens.length };
    }),
  );
  return batchesWithCount;
});
