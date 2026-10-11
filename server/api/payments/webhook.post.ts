import { confirmPayment } from '../../services/paymentService';

/**
 * Mollie posts `id=tr_…` here whenever a payment changes. The body is only a
 * nudge: the payment is fetched from Mollie with the app's own key before
 * anything happens, so a forged call can at most make the app look up a real
 * payment.
 *
 * Unknown ids get the same empty `200` as known ones, so probing learns
 * nothing. Only a failure to reach Mollie answers with an error, which is what
 * makes Mollie try again later.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: unknown }>(event);
  const paymentId = typeof body?.id === 'string' ? body.id : '';
  if (paymentId.startsWith('tr_')) {
    try {
      await confirmPayment(paymentId);
    }
    catch (error) {
      console.error(`Failed to process Mollie webhook for ${paymentId}:`, error);
      throw createError({ statusCode: 503, statusMessage: 'Service Unavailable' });
    }
  }
  setResponseStatus(event, 200);
  return '';
});
