import { getTokenHistory } from '../../../services/tokenService';

/**
 * Every view one token spent and every payment that bought it again, newest
 * first, with the token as it stands now — what an admin opens when a visitor
 * asks why their link stopped working, or what they paid for.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const history = await getTokenHistory(id);
  if (!history) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }
  return history;
});
