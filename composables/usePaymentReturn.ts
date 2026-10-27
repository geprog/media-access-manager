import type { MaybeRefOrGetter } from 'vue';

/**
 * Where a visitor returning from Mollie stands:
 * - `checking`/`pending`: the payment is not confirmed yet, so the token page
 *   holds back — loading it now would show "your access has ended" to someone
 *   who just paid.
 * - `failed`: the payment ended without money; the page loads as usual and
 *   offers the purchase again.
 * - `timeout`: still not confirmed after a while; the page loads anyway, in
 *   case the webhook got through in the meantime.
 *
 * A payment still `open` — the visitor left Mollie's checkout without paying —
 * is neither: Mollie keeps it open until it expires, so the page loads and
 * offers to continue it.
 */
export type PaymentReturnState = 'idle' | 'checking' | 'pending' | 'failed' | 'timeout';

/** Bank transfers and some wallets take a moment; two minutes covers the usual cases. */
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40;
type PaymentStatus = 'paid' | 'pending' | 'open' | 'failed';

/**
 * Confirms the payment named in `?payment=` before the token page loads, then
 * calls `onSettled`. Without that parameter `onSettled` runs straight away.
 */
export function usePaymentReturn(token: MaybeRefOrGetter<string>, onSettled: () => unknown) {
  const route = useRoute();
  const router = useRouter();
  const paymentId = typeof route.query.payment === 'string' ? route.query.payment : null;
  const state = ref<PaymentReturnState>(paymentId ? 'checking' : 'idle');
  let stopped = false;

  onBeforeUnmount(() => {
    stopped = true;
  });

  async function settle(next: PaymentReturnState) {
    state.value = next;
    // A reload must not confirm the same payment again, and the address is
    // what a visitor bookmarks or shares.
    const { payment: _payment, ...query } = route.query;
    await router.replace({ query });
    await onSettled();
  }

  async function poll(attempt: number): Promise<void> {
    if (stopped) {
      return;
    }
    let status: PaymentStatus | null;
    try {
      ({ status } = await $fetch<{ status: PaymentStatus }>(
        `/api/purchase/${encodeURIComponent(toValue(token))}/${encodeURIComponent(paymentId!)}`,
        { method: 'POST' },
      ));
    }
    catch {
      // An unknown or foreign payment id, or Mollie unreachable: the token page
      // itself shows whatever state the token is in.
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

  if (paymentId) {
    poll(0);
  }
  else {
    onSettled();
  }

  return { state };
}
