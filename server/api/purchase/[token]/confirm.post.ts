import { confirmTokenPayment, PurchaseUnavailableError } from '../../../services/paymentService';

/**
 * Where a visitor returning from Mollie learns how their payment went. Asks
 * about the token's own open payment, so nothing in the return URL decides
 * which payment that is. A POST, because a paid payment is applied right here
 * with the same check the webhook runs.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  try {
    return { status: await confirmTokenPayment(token) };
  }
  catch (error) {
    if (error instanceof PurchaseUnavailableError) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' });
    }
    console.error(`Failed to confirm the payment of a token:`, error);
    throw createError({ statusCode: 502, statusMessage: 'Bad Gateway' });
  }
});
