import { createToken } from '../../services/tokenService';

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    mediaId?: string
    name?: string
    batchId?: string
    startsAt?: string
    expiresAt?: string
    usageLimit?: number
  }>(event);
  const mediaId = body?.mediaId ?? '';
  const name = body?.name ?? '';
  if (!mediaId || !name) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const options: Parameters<typeof createToken>[0] = { mediaId, name };
  if (body?.batchId)
    options.batchId = body.batchId;
  if (body?.startsAt)
    options.startsAt = new Date(body.startsAt);
  if (body?.expiresAt)
    options.expiresAt = new Date(body.expiresAt);
  if (body?.usageLimit != null)
    options.usageLimit = body.usageLimit;
  return createToken(options);
});
