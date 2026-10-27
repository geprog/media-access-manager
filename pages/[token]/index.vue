<template>
  <div class="flex min-h-screen flex-col items-center p-4" :class="centered ? 'justify-center' : 'py-8'">
    <!-- Returning from Mollie: nothing is shown until the payment is known,
         or someone who just paid would be told their access has ended. -->
    <PublicAccessLoading v-if="paymentMessage" :message="paymentMessage" />
    <template v-else>
      <UAlert
        v-if="paymentNotice"
        class="mb-6 max-w-md"
        color="warning"
        variant="subtle"
        icon="i-heroicons-exclamation-circle"
        :title="paymentNotice"
      />
      <PublicAccessLoading v-if="loading" />
      <PublicAccessDenied
        v-else-if="!access"
        :token="token"
        :reason="denial?.reason"
        :title="denial?.title"
        :media-id="denial?.mediaId"
        :group-id="denial?.groupId"
        :purchase-options="denial?.purchaseOptions"
        :open-payment="denial?.openPayment"
      />
      <!-- A group token unlocks several media, so the visitor picks one instead
           of being dropped straight into a player. Nothing is spent here. -->
      <PublicGroupMediaList
        v-else-if="access.type === 'group'"
        :token="token"
        :title="access.title"
        :expires-at="access.access.expiresAt"
        :valid-for="access.access.validFor"
        :media="access.media"
        :purchase-options="access.purchaseOptions"
        :open-payment="access.openPayment"
      />
      <!-- Watching would spend a limited view or start the access window, so the
           visitor is asked first instead of losing it to an accidental tap. -->
      <PublicViewConfirmation
        v-else-if="access.confirmationRequired"
        :title="access.title"
        :expires-at="access.access.expiresAt"
        :valid-for="access.access.validFor"
        :usage-limit="access.access.usageLimit"
        :usage-count="access.access.usageCount"
        :loading="confirming"
        @confirm="confirm"
      />
      <PublicMediaPlayer
        v-else
        :title="access.title"
        :embed="access.embed"
        :expires-at="access.access.expiresAt"
        :valid-for="access.access.validFor"
        :usage-limit="access.access.usageLimit"
        :usage-count="access.access.usageCount"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { OpenPayment, PurchaseOption } from '~/components/PublicPurchaseOptions.vue';

definePageMeta({
  public: true,
});

const route = useRoute();
const { t } = useI18n();

const token = computed(() => route.params.token as string);

const accessUrl = () => `/api/access/${encodeURIComponent(token.value)}` as const;

const { data: access, error, status, execute } = useFetch(
  accessUrl,
  // Views a group token spent come back with this list, so returning here
  // after watching must not show the counts from before.
  // Held back until a payment the visitor returns with is confirmed: loading can
  // spend a view, and before then it would only report the old expiry.
  { getCachedData: () => undefined, immediate: false },
);

const { state: paymentState } = usePaymentReturn(token, execute);

const paymentMessage = computed(() => {
  if (paymentState.value === 'checking') {
    return t('public_payment_checking');
  }
  return paymentState.value === 'pending' ? t('public_payment_pending') : null;
});

const paymentNotice = computed(() => {
  if (paymentState.value === 'failed') {
    return t('public_payment_failed');
  }
  // Only worth saying while the token still looks expired; once the webhook
  // got through, the content is the answer.
  return paymentState.value === 'timeout' && !access.value ? t('public_payment_timeout') : null;
});

const { confirming, error: confirmError, confirm } = useViewConfirmation(accessUrl, access);

const loading = computed(() => status.value === 'pending' || status.value === 'idle');

const denial = computed(() => {
  const body = (confirmError.value ?? error.value)?.data as {
    data?: {
      reason?: string
      title?: string | null
      mediaId?: string | null
      groupId?: string | null
      purchaseOptions?: PurchaseOption[]
      openPayment?: OpenPayment | null
    }
  } | undefined;
  return body?.data;
});

// A list needs the top of the page; a player or a short notice reads better
// in the middle of it.
const centered = computed(() => access.value?.type !== 'group');
</script>
