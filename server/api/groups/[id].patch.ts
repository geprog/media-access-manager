import { updateMediaGroup } from '../../services/mediaGroupService';
import { readPriceUpdate } from '../../utils/priceInput';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const body = await readBody<{ name?: string, mediaIds?: string[] }>(event);
  const name = body?.name?.trim();
  if (name !== undefined && !name) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  if (body?.mediaIds && body.mediaIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const prices = readPriceUpdate(body ?? {});
  if (!prices) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const updated = await updateMediaGroup(id, { name, mediaIds: body?.mediaIds, ...prices });
  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }
  return updated;
});
