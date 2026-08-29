import { listAvailableMediaFromProvider } from '../../../services/mediaService';

export default defineEventHandler(async (event) => {
  const providerId = getRouterParam(event, 'providerId');
  if (!providerId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  return listAvailableMediaFromProvider(providerId);
});
