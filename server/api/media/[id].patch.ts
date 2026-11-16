import { updateMediaPrices } from '../../services/mediaService';
import { readPriceUpdate } from '../../utils/priceInput';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const prices = readPriceUpdate(await readBody(event));
  if (!prices) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const updated = await updateMediaPrices(id, prices);
  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }
  return updated;
});
