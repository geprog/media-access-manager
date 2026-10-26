import type { BatchChanges } from '../../services/tokenService';
import { updateBatch } from '../../services/tokenService';
import { parseTokenSettingsChanges } from '../../utils/tokenSettings';

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
  const body = await readBody<{ name?: string } | undefined>(event);
  const settings = parseTokenSettingsChanges(body);
  if (!settings) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const changes: BatchChanges = { ...settings };

  if (body?.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
    }
    changes.name = name;
  }

  const updated = await updateBatch(id, changes);
  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }
  return updated;
});
