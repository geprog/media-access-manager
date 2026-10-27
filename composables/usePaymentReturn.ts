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
 * Confirms the token's payment before the page loads when Mollie sent the
 * visitor back (`?checkout=returned`), then calls `onSettled`. Without that
 * marker `onSettled` runs straight away.
 */
export function usePaymentReturn(token: MaybeRefOrGetter<string>, onSettled: () => unknown) {
  const route = useRoute();
  const router = useRouter();
  const returned = route.query.checkout === 'returned';
  const state = ref<PaymentReturnState>(returned ? 'checking' : 'idle');
  let stopped = false;

  onBeforeUnmount(() => {
    stopped = true;
  });

  async function settle(next: PaymentReturnState) {
    state.value = next;
    // A reload must not hold the page back again, and the address is what a
    // visitor bookmarks or shares.
    const { checkout: _checkout, ...query } = route.query;
    await router.replace({ query });
    await onSettled();
  }

  async function poll(attempt: number): Promise<void> {
    if (stopped) {
      return;
    }
    let status: PaymentStatus | null;
    try {
      // `null` when no payment is in progress any more, e.g. the webhook was
      // faster and already applied it.
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

  if (returned) {
    poll(0);
  }
  else {
    onSettled();
  }

  return { state };
}
