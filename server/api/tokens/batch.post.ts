import { createBatch } from '../../services/tokenService';

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    mediaId?: string
    name?: string
    count?: number
    startsAt?: string
    expiresAt?: string
    usageLimit?: number
  }>(event);
  const mediaId = body?.mediaId ?? '';
  const name = body?.name ?? '';
  const count = body?.count ?? 1;
  if (!mediaId || !name || count < 1 || count > 500) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const options: Parameters<typeof createBatch>[2] = { name };
  if (body?.startsAt)
    options.startsAt = new Date(body.startsAt);
  if (body?.expiresAt)
    options.expiresAt = new Date(body.expiresAt);
  if (body?.usageLimit != null)
    options.usageLimit = body.usageLimit;
  return createBatch(mediaId, count, options);
});
