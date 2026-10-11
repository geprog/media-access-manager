import { isPurchasingEnabled } from '../../services/paymentService';

/** Lets the admin price editor say when prices would not be offered anyway. */
export default defineEventHandler(() => ({ enabled: isPurchasingEnabled() }));
