import type { TokenTarget } from '../../services/tokenService';
import { parseValidityDuration } from '~/utils/accessWindow';
import { createBatch } from '../../services/tokenService';

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    mediaId?: string
    groupId?: string
    name?: string
    count?: number
    startsAt?: string
    expiresAt?: string
    validFor?: unknown
    usageLimit?: number
  }>(event);
  // Trimmed like a rename, so a name of only spaces counts as none.
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const count = body?.count ?? 1;
  // Same rule as for a single token: exactly one target.
  const target: TokenTarget | null = body?.mediaId
    ? (body?.groupId ? null : { mediaId: body.mediaId })
    : (body?.groupId ? { groupId: body.groupId } : null);
  if (!target || !name || count < 1 || count > 500) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  // A token's validity starts either on creation, optionally up to a fixed
  // expiry date, or on its first use for a fixed duration — not both.
  const validFor = body?.validFor == null ? null : parseValidityDuration(body.validFor);
  if (body?.validFor != null && (!validFor || body?.expiresAt)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const options: Parameters<typeof createBatch>[2] = { name };
  if (body?.startsAt)
    options.startsAt = new Date(body.startsAt);
  if (body?.expiresAt)
    options.expiresAt = new Date(body.expiresAt);
  if (validFor)
    options.validFor = validFor;
  if (body?.usageLimit != null)
    options.usageLimit = body.usageLimit;
  return createBatch(target, count, options);
});
