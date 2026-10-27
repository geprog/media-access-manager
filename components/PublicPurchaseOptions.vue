<template>
  <div class="flex flex-col items-center gap-3">
    <h2 class="text-lg font-semibold">
      {{ $t('public_purchase_title') }}
    </h2>
    <!-- Mollie keeps a payment open after a failed or canceled attempt, until
         it expires. Starting another one could have the visitor pay twice, so
         the one they began is continued instead, where they can try again. -->
    <template v-if="openPayment">
      <p class="text-sm text-muted">
        {{ openPaymentText }}
      </p>
      <UButton
        v-if="openPayment.resumable"
        icon="i-heroicons-arrow-right"
        size="lg"
        :loading="pendingPeriod !== null"
        :label="openPayment.status === 'open' ? $t('public_purchase_continue') : $t('public_purchase_details')"
        @click="purchase(openPayment.period)"
      />
    </template>
    <p v-else class="text-sm text-muted">
      {{ $t('public_purchase_intro') }}
    </p>
    <div v-if="!openPayment" class="flex flex-wrap justify-center gap-2">
      <UButton
        v-for="option in options"
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
    <UAlert
      v-if="failed"
      color="error"
      variant="subtle"
      icon="i-heroicons-exclamation-circle"
      :title="$t('public_purchase_error')"
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
}

const props = defineProps<{
  token: string
  options: PurchaseOption[]
  openPayment?: OpenPayment | null
}>();

const { t, locale } = useI18n();

const pendingPeriod = ref<PurchaseOption['period'] | null>(null);

const openPaymentText = computed(() => {
  switch (props.openPayment?.status) {
    case 'open':
      return t('public_purchase_open');
    case 'transfer':
      return t('public_purchase_transfer');
    default:
      return t('public_purchase_processing');
  }
});
const failed = ref(false);

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
  failed.value = false;
  try {
    const { checkoutUrl } = await $fetch<{ checkoutUrl: string }>(
      `/api/purchase/${encodeURIComponent(props.token)}`,
      { method: 'POST', body: { period, locale: locale.value } },
    );
    await navigateTo(checkoutUrl, { external: true });
  }
  catch {
    failed.value = true;
    pendingPeriod.value = null;
  }
}
</script>
