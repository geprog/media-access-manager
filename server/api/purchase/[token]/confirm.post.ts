import { confirmTokenPayment, PurchaseUnavailableError } from '../../../services/paymentService';
import { isAdminRequest } from '../../../utils/publicAccess';

/**
 * Where the token page learns how the token's payment stands before it loads.
 * Asks about the token's own open payment, so nothing in the URL decides which
 * payment that is. A POST, because a paid payment is applied right here with
 * the same check the webhook runs.
 *
 * Only an admin is told where the payment is in the Mollie dashboard: that is
 * the account's own view, and a visitor could not open it anyway.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  let check: Awaited<ReturnType<typeof confirmTokenPayment>>;
  try {
    check = await confirmTokenPayment(token);
  }
  catch (error) {
    if (error instanceof PurchaseUnavailableError) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' });
    }
    console.error(`Failed to confirm the payment of a token:`, error);
    throw createError({ statusCode: 502, statusMessage: 'Bad Gateway' });
  }
  return {
    status: check.status,
    dashboardUrl: await isAdminRequest(event) ? check.dashboardUrl : null,
  };
});
