import { listOpenPaymentNotices } from '../../services/paymentNoticeService';

/** Payments an admin should look at, until they dismiss them. */
export default defineEventHandler(() => listOpenPaymentNotices());
