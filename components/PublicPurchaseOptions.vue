<template>
  <div class="flex flex-col items-center gap-3">
    <h2 class="text-lg font-semibold">
      {{ $t('public_purchase_title') }}
    </h2>
    <!-- Mollie keeps a payment open after a failed or canceled attempt, until
         it expires. Starting another one could have the visitor pay twice, so
         the one they began is continued instead, where they can try again —
         unless nobody has tried to pay it, when another period replaces it. -->
    <template v-if="openPayment">
      <p class="text-sm text-muted">
        {{ openPaymentText }}
      </p>
      <UButton
        v-if="openPayment.resumable"
        icon="i-heroicons-arrow-right"
        size="lg"
        :loading="pendingPeriod === openPayment.period"
        :disabled="canceling || (pendingPeriod !== null && pendingPeriod !== openPayment.period)"
        :label="openPayment.status === 'open' ? $t('public_purchase_continue') : $t('public_purchase_details')"
        @click="purchase(openPayment.period)"
      />
    </template>
    <p v-else class="text-sm text-muted">
      {{ $t('public_purchase_intro') }}
    </p>
    <div v-if="offeredOptions.length" class="flex flex-wrap justify-center gap-2">
      <UButton
        v-for="option in offeredOptions"
        :key="option.period"
        icon="i-heroicons-shopping-cart"
        size="lg"
        :variant="option.period === 'year' ? 'solid' : 'outline'"
        :loading="pendingPeriod === option.period"
        :disabled="pendingPeriod !== null"
        :label="optionLabel(option)"
        @click="purchase(option.period)"
      />
    </div>
    <!-- A bank transfer stays open for days. Where Mollie lets it be
         canceled, the visitor need not wait them out to pay another way. -->
    <UButton
      v-if="openPayment?.cancelable"
      variant="link"
      color="neutral"
      icon="i-heroicons-x-mark"
      :loading="canceling"
      :disabled="pendingPeriod !== null"
      :label="$t('public_purchase_cancel')"
      @click="cancel"
    />
    <UAlert
      v-if="failed"
      color="error"
      variant="subtle"
      icon="i-heroicons-exclamation-circle"
      :title="$t(FAILURE_MESSAGES[failed])"
    />
    <p class="text-xs text-muted">
      {{ $t('public_purchase_secure_hint') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { formatPrice } from '~/utils/money';

export interface PurchaseOption {
  period: 'month' | 'year'
  /** In the currency's minor unit, as the access endpoint sends it. */
  amount: number
  currency: string
}

/** A payment the visitor started and has not finished, as the access endpoint sends it. */
export interface OpenPayment {
  period: PurchaseOption['period']
  /**
   * `open`: to be continued at Mollie. `pending`: being processed, done in a
   * moment. `transfer`: a bank transfer, done once the money arrives.
   */
  status: 'open' | 'pending' | 'transfer'
  /** Whether Mollie's checkout still has something to show for it. */
  resumable: boolean
  /** Whether Mollie lets it be canceled, so another payment can be started. */
  cancelable: boolean
  /** Whether picking another period starts a fresh payment instead of this one. */
  replaceable: boolean
}

const props = defineProps<{
  token: string
  options: PurchaseOption[]
  openPayment?: OpenPayment | null
}>();

/** The open payment was canceled: the page reloads its access to offer buying again. */
const emit = defineEmits<{ canceled: [] }>();

const { t, locale } = useI18n();

const pendingPeriod = ref<PurchaseOption['period'] | null>(null);

/**
 * The periods still open to the visitor: all of them while they began no
 * payment, and otherwise the ones that would replace it — its own period is
 * what **Continue payment** leads to.
 */
const offeredOptions = computed(() => {
  const open = props.openPayment;
  if (!open) {
    return props.options;
  }
  return open.replaceable ? props.options.filter(option => option.period !== open.period) : [];
});

const openPaymentText = computed(() => {
  switch (props.openPayment?.status) {
    case 'open':
      return offeredOptions.value.length ? t('public_purchase_open_switch') : t('public_purchase_open');
    case 'transfer':
      return t('public_purchase_transfer');
    default:
      return t('public_purchase_processing');
  }
});
const canceling = ref(false);
type Failure = 'purchase' | 'unavailable' | 'in_progress' | 'cancel';
const failed = ref<Failure | null>(null);

const FAILURE_MESSAGES: Record<Failure, string> = {
  purchase: 'public_purchase_error',
  unavailable: 'public_purchase_unavailable',
  in_progress: 'public_purchase_in_progress',
  cancel: 'public_purchase_cancel_error',
};

/**
 * The server says why a purchase could not start: nothing is for sale any
 * more (the token was renewed meanwhile, say) or the payment is being
 * processed. Both call for a reload, not another try.
 */
function purchaseFailure(error: unknown): Failure {
  const reason = (error as { data?: { data?: { reason?: string } } })?.data?.data?.reason;
  if (reason === 'purchase_unavailable') {
    return 'unavailable';
  }
  if (reason === 'payment_in_progress') {
    return 'in_progress';
  }
  return 'purchase';
}

function optionLabel(option: PurchaseOption) {
  const price = formatPrice(option.amount, option.currency, locale.value);
  return option.period === 'year'
    ? t('public_purchase_year', { price })
    : t('public_purchase_month', { price });
}

/**
 * Only the period is sent: what it costs is the server's to decide. The
 * visitor leaves for Mollie's checkout — of the payment they already started,
 * while there is one — and comes back to this token's page.
 */
async function purchase(period: PurchaseOption['period']) {
  pendingPeriod.value = period;
  failed.value = null;
  try {
    const { checkoutUrl } = await $fetch<{ checkoutUrl: string }>(
      `/api/purchase/${encodeURIComponent(props.token)}`,
      { method: 'POST', body: { period, locale: locale.value } },
    );
    await navigateTo(checkoutUrl, { external: true });
  }
  catch (error) {
    failed.value = purchaseFailure(error);
    pendingPeriod.value = null;
  }
}

async function cancel() {
  canceling.value = true;
  failed.value = null;
  try {
    await $fetch(`/api/purchase/${encodeURIComponent(props.token)}/cancel`, { method: 'POST' });
    emit('canceled');
  }
  catch {
    failed.value = 'cancel';
  }
  finally {
    canceling.value = false;
  }
}
</script>
