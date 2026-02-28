import { listMediaFromProvider } from '../../services/mediaService';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const providerId = (query.providerId as string) ?? 'vimeo';
  return listMediaFromProvider(providerId);
});
