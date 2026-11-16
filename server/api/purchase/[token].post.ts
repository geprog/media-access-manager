import { PaymentInProgressError, PurchaseUnavailableError, startPurchase } from '../../services/paymentService';
import { isPurchasePeriod } from '../../utils/purchase';

/**
 * Starts buying access again for an expired token, or leads back to the
 * payment the visitor already started. The body only names the period; what it
 * costs, and whether it may be bought at all, is decided here.
 */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');
  const body = await readBody<{ period?: unknown, locale?: unknown }>(event);
  if (!token || !isPurchasePeriod(body?.period)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  try {
    return await startPurchase({
      tokenValue: token,
      period: body.period,
      locale: typeof body.locale === 'string' ? body.locale : 'en',
      origin: getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin,
    });
  }
  catch (error) {
    if (error instanceof PurchaseUnavailableError) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found', data: { reason: 'purchase_unavailable' } });
    }
    if (error instanceof PaymentInProgressError) {
      throw createError({ statusCode: 409, statusMessage: 'Conflict', data: { reason: 'payment_in_progress' } });
    }
    console.error(`Failed to start a purchase for a token:`, error);
    throw createError({ statusCode: 502, statusMessage: 'Bad Gateway', data: { reason: 'payment_provider_error' } });
  }
});
