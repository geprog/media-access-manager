import { createMediaGroup } from '../../services/mediaGroupService';

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string, mediaIds?: string[] }>(event);
  const name = body?.name?.trim() ?? '';
  const mediaIds = body?.mediaIds ?? [];
  // A group with no media would hand out tokens that lead to an empty list.
  if (!name || mediaIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  return createMediaGroup(name, mediaIds);
});
