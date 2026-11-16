import { dismissPaymentNotice } from '../../../../services/paymentNoticeService';

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  if (!dismissPaymentNotice(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' });
  }
  setResponseStatus(event, 204);
  return null;
});
