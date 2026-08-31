import type { MediaInsert } from '~/server/db/schema';
import { generateId } from '~/server/utils/db';
import { createMedia } from '../../services/mediaService';

export default defineEventHandler(async (event) => {
  const body = await readBody<MediaInsert>(event);
  const id = generateId();
  const title = body?.title ?? '';
  const providerConfig = body?.providerConfig ?? {};
  if (!id || !title || !providerConfig.providerId) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  return createMedia({ id, title, providerConfig });
});
