import { getTokenViewHistory } from '../../../services/tokenService';

/**
 * Every view one token spent, newest first, with the token as it stands now —
 * what an admin opens when a visitor asks why their link stopped working.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const history = await getTokenViewHistory(id);
  if (!history) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }
  return history;
});
