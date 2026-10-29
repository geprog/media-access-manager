import { cancelOpenPayment, PaymentNotCancelableError, PurchaseUnavailableError } from '../../../services/paymentService';

/**
 * Cancels the token's open payment where Mollie allows it, so the visitor
 * can pay another way instead of waiting for it to expire. The page offers
 * this only for a payment Mollie reported cancelable; anything else is a 409.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  try {
    await cancelOpenPayment(token);
  }
  catch (error) {
    if (error instanceof PurchaseUnavailableError) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' });
    }
    if (error instanceof PaymentNotCancelableError) {
      throw createError({ statusCode: 409, statusMessage: 'Conflict', data: { reason: 'payment_not_cancelable' } });
    }
    console.error(`Failed to cancel the payment of a token:`, error);
    throw createError({ statusCode: 502, statusMessage: 'Bad Gateway' });
  }
  setResponseStatus(event, 204);
  return null;
});
