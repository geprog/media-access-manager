import type { PaymentNotice } from '../db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { paymentNotices } from '../db/schema';
import { useDb } from '../utils/db';

/**
 * Keeps a payment an admin should look at — paid for a token that is gone or
 * needed no renewal any more, or refunded or charged back — until they
 * dismiss it. One row per payment, so a retried webhook adds nothing.
 */
export function recordPaymentNotice(data: {
  paymentId: string
  kind: PaymentNotice['kind']
  description: string
  dashboardUrl: string | null
  now?: Date
}) {
  const { now, ...notice } = data;
  // Dated here: the column's own default is SQLite's text timestamp, which
  // the integer mapping reads as no date at all.
  useDb().insert(paymentNotices).values({ ...notice, createdAt: now ?? new Date() }).onConflictDoNothing().run();
}

/**
 * Whether this payment was once found to have bought nothing, dismissed since
 * or not. The admin was told to refund it, so it must not extend the token
 * after all should Mollie call about it again later.
 */
export function isPaymentUnapplied(paymentId: string): boolean {
  const rows = useDb()
    .select({ paymentId: paymentNotices.paymentId })
    .from(paymentNotices)
    .where(and(eq(paymentNotices.paymentId, paymentId), eq(paymentNotices.kind, 'unapplied')))
    .all();
  return rows.length > 0;
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
