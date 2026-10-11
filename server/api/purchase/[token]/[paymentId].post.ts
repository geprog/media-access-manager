import { confirmPayment } from '../../../services/paymentService';

const PAYMENT_ID = /^tr_\w+$/;

/**
 * Where a visitor returning from Mollie learns how their payment went. A POST,
 * because a paid payment is applied right here with the same check the webhook runs, so the
 * content opens without waiting for Mollie's call — and works where Mollie
 * cannot call at all, like a local setup.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');
  const paymentId = getRouterParam(event, 'paymentId');
  if (!token || !paymentId || !PAYMENT_ID.test(paymentId)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  let status: Awaited<ReturnType<typeof confirmPayment>>;
  try {
    status = await confirmPayment(paymentId, token);
  }
  catch (error) {
    console.error(`Failed to confirm payment ${paymentId}:`, error);
    throw createError({ statusCode: 502, statusMessage: 'Bad Gateway' });
  }
  if (!status) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }
  return { status };
});
