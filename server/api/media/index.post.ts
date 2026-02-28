import { createMedia } from '../../services/mediaService';

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    id?: string
    providerId?: string
    title?: string
    providerConfig?: Record<string, unknown>
  }>(event);
  const id = body?.id ?? '';
  const providerId = body?.providerId ?? 'vimeo';
  const title = body?.title ?? '';
  const providerConfig = body?.providerConfig ?? {};
  if (!id || !title) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  return createMedia({ id, providerId, title, providerConfig });
});
