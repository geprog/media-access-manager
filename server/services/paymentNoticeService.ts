import type { PaymentNotice } from '../db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { paymentNotices } from '../db/schema';
import { useDb } from '../utils/db';

/**
 * Keeps a payment an admin should look at — paid for a token that is gone, or
 * refunded or charged back — until they dismiss it. One row per payment, so a
 * retried webhook adds nothing.
 */
export function recordPaymentNotice(data: {
  paymentId: string
  kind: PaymentNotice['kind']
  description: string
  dashboardUrl: string | null
}) {
  useDb().insert(paymentNotices).values(data).onConflictDoNothing().run();
}

/** The notices still shown, newest first. */
export async function listOpenPaymentNotices(): Promise<PaymentNotice[]> {
  return useDb()
    .select()
    .from(paymentNotices)
    .where(isNull(paymentNotices.dismissedAt))
    .orderBy(desc(paymentNotices.createdAt));
}

/** `false` when there was no such open notice. */
export function dismissPaymentNotice(paymentId: string, now: Date = new Date()): boolean {
  const { changes } = useDb()
    .update(paymentNotices)
    .set({ dismissedAt: now })
    .where(and(eq(paymentNotices.paymentId, paymentId), isNull(paymentNotices.dismissedAt)))
    .run();
  return changes > 0;
}
