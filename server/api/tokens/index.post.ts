import type { TokenTarget } from '../../services/tokenService';
import { parseValidityDuration } from '~/utils/accessWindow';
import { createToken } from '../../services/tokenService';

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    mediaId?: string
    groupId?: string
    name?: string
    startsAt?: string
    expiresAt?: string
    validFor?: unknown
    usageLimit?: number
  }>(event);
  const name = body?.name ?? '';
  // A token points at one media or at one group, never at both and never at
  // neither — otherwise there is nothing for it to unlock.
  const target: TokenTarget | null = body?.mediaId
    ? (body?.groupId ? null : { mediaId: body.mediaId })
    : (body?.groupId ? { groupId: body.groupId } : null);
  if (!target || !name) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  // A token's validity starts either on creation, optionally up to a fixed
  // expiry date, or on its first use for a fixed duration — not both.
  const validFor = body?.validFor == null ? null : parseValidityDuration(body.validFor);
  if (body?.validFor != null && (!validFor || body?.expiresAt)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const options: Parameters<typeof createToken>[0] = { ...target, name };
  if (body?.startsAt)
    options.startsAt = new Date(body.startsAt);
  if (body?.expiresAt)
    options.expiresAt = new Date(body.expiresAt);
  if (validFor)
    options.validFor = validFor;
  if (body?.usageLimit != null)
    options.usageLimit = body.usageLimit;
  return createToken(options);
});
