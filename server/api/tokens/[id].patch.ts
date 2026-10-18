import { updateToken } from '../../services/tokenService';
import { parseTokenSettingsChanges } from '../../utils/tokenSettings';

/**
 * Changes the usage limit and validity of a single token, e.g. to give one
 * visitor more time than the rest of the batch. Only the fields sent are
 * touched; sending `expiresAt` or `validFor` replaces the validity as a whole.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const changes = parseTokenSettingsChanges(await readBody(event));
  if (!changes) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const updated = await updateToken(id, changes);
  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }
  return updated;
});
