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
 * - `timeout`: still processing after a while; the page loads anyway, in case
 *   the webhook got through in the meantime.
 *
 * A payment left `open` at Mollie's checkout, or a bank transfer on its way,
 * is nothing to wait for: the page loads and offers to continue it, or says
 * the transfer is awaited.
 */
export type PaymentCheckState = 'idle' | 'checking' | 'pending' | 'failed' | 'timeout';

/** Card and wallet payments are processed in a moment; two minutes covers the usual cases. */
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40;
type PaymentStatus = 'paid' | 'pending' | 'transfer' | 'open' | 'failed';

/**
 * Settles the token's payment before the token page loads, then calls
 * `onSettled`. Mollie's redirect leads back here without saying anything about
 * the payment, so this runs on every load rather than only after a checkout —
 * which also covers a visitor who comes back later while it is processed.
 */
export function usePaymentCheck(token: MaybeRefOrGetter<string>, onSettled: () => unknown) {
  const state = ref<PaymentCheckState>('checking');
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
    let status: PaymentStatus | null;
    try {
      // `null` when no payment is in progress, e.g. none was started or the
      // webhook already applied it.
      ({ status } = await $fetch<{ status: PaymentStatus | null }>(
        `/api/purchase/${encodeURIComponent(toValue(token))}/confirm`,
        { method: 'POST' },
      ));
    }
    catch {
      // An unknown token, or Mollie unreachable: the token page itself shows
      // whatever state the token is in.
      status = null;
    }
    if (status === 'pending') {
      if (attempt + 1 >= MAX_POLLS) {
        return settle('timeout');
      }
      state.value = 'pending';
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
      return poll(attempt + 1);
    }
    return settle(status === 'failed' ? 'failed' : 'idle');
  }

  poll(0);

  return { state };
}
