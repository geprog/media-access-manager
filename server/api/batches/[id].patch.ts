import type { BatchChanges } from '../../services/tokenService';
import { parseValidityDuration } from '~/utils/accessWindow';
import { updateBatch } from '../../services/tokenService';

/**
 * Changes a batch and the settings all its tokens share. Only the fields sent
 * are touched; sending `expiresAt` or `validFor` replaces the validity as a
 * whole, the same either-or as on creation.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const body = await readBody<{
    name?: string
    usageLimit?: number | null
    expiresAt?: string | null
    validFor?: unknown
  }>(event);
  const changes: BatchChanges = {};

  if (body?.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
    }
    changes.name = name;
  }

  if (body?.usageLimit !== undefined) {
    if (body.usageLimit !== null && (!Number.isInteger(body.usageLimit) || body.usageLimit < 1)) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
    }
    changes.usageLimit = body.usageLimit;
  }

  if (body?.validFor != null) {
    const validFor = parseValidityDuration(body.validFor);
    if (!validFor || body.expiresAt) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
    }
    changes.validity = { expiresAt: null, validFor };
  }
  else if (body?.expiresAt !== undefined) {
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
    }
    changes.validity = { expiresAt, validFor: null };
  }

  const updated = await updateBatch(id, changes);
  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }
  return updated;
});
