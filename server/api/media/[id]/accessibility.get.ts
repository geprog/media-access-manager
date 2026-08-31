import { verifyMediaAccessibility } from '../../../services/mediaService';
import { getAppHost } from '../../../utils/requestHost';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  // `?refresh=1` skips the cache so the admin can re-check after fixing settings.
  const refresh = getQuery(event).refresh === '1';
  const result = await verifyMediaAccessibility(id, {
    refresh,
    context: { host: getAppHost(event) },
  });
  if (!result) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }
  return result;
});
