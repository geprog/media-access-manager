import type { MaybeRefOrGetter } from 'vue';

/**
 * Where the token's payment stands while the token page waits for it:
 * - `checking`: asking the server, which on most loads finds no payment at all
 *   and answers without asking Mollie, so the page shows its usual loader.
 * - `pending`: Mollie is processing a payment, so the page holds back —
 *   loading it now would show "your access has ended" to someone who just
 *   paid.
 * - `failed`: the payment ended without money; the page loads as usual and
 *   offers the purchase again.
 * - `timeout`: still processing after a while — the polls here ran out, or
 *   the payment was started long enough ago that the server says not to
 *   wait for it; the page loads anyway and says it is taking longer.
 *
 * A payment left `open` at Mollie's checkout, or a bank transfer on its way,
 * is nothing to wait for: the page loads and offers to continue it, or says
 * the transfer is awaited.
 */
export type PaymentCheckState = 'idle' | 'checking' | 'pending' | 'failed' | 'timeout';

/**
 * Card and wallet payments are processed in a moment; two minutes covers the
 * usual cases. Past that the page loads anyway and says it may take longer.
 */
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40;
type PaymentStatus = 'paid' | 'pending' | 'transfer' | 'open' | 'failed' | 'reversed';

interface PaymentCheck {
  /** `null` when no payment is in progress, e.g. none was started or the webhook already applied it. */
  status: PaymentStatus | null
  /** Whether a `pending` payment is recent enough to be worth holding the page for. */
  wait: boolean
  dashboardUrl: string | null
}

/**
 * Settles the token's payment before the token page loads, then calls
 * `onSettled`. Mollie's redirect leads back here without saying anything about
 * the payment, so this runs on every load rather than only after a checkout —
 * which also covers a visitor who comes back later while it is processed.
 */
export function usePaymentCheck(token: MaybeRefOrGetter<string>, onSettled: () => unknown) {
  const state = ref<PaymentCheckState>('checking');
  /** Only ever set for an admin: the payment in the Mollie dashboard. */
  const dashboardUrl = ref<string | null>(null);
  let stopped = false;

  onBeforeUnmount(() => {
    stopped = true;
  });

  async function settle(next: PaymentCheckState) {
    state.value = next;
    await onSettled();
  }

  async function poll(attempt: number): Promise<void> {
    if (stopped) {
      return;
    }
    let check: PaymentCheck;
    try {
      check = await $fetch<PaymentCheck>(
        `/api/purchase/${encodeURIComponent(toValue(token))}/confirm`,
        { method: 'POST' },
      );
      dashboardUrl.value = check.dashboardUrl;
    }
    catch {
      // An unknown token, or Mollie unreachable: the token page itself shows
      // whatever state the token is in.
      check = { status: null, wait: false, dashboardUrl: null };
    }
    const { status } = check;
    if (status === 'pending') {
      // Not every visit waits again for a payment that has been processing
      // for a long time: the server says when it stopped being worth it.
      if (!check.wait || attempt + 1 >= MAX_POLLS) {
        return settle('timeout');
      }
      state.value = 'pending';
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      return poll(attempt + 1);
    }
    return settle(status === 'failed' ? 'failed' : 'idle');
  }

  poll(0);

  return { state, dashboardUrl };
}
