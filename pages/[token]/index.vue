<template>
  <div class="flex min-h-screen flex-col items-center p-4" :class="centered ? 'justify-center' : 'py-8'">
    <!-- A payment being processed: nothing is shown until it is through, or
         someone who just paid would be told their access has ended. -->
    <template v-if="paymentMessage">
      <PublicAccessLoading :message="paymentMessage" />
      <PublicPaymentNotice
        class="mt-6"
        :token="token"
        :state="paymentState"
        :dashboard-url="dashboardUrl"
        :content-shown="!!access"
      />
    </template>
    <template v-else>
      <PublicPaymentNotice
        class="mb-6"
        :token="token"
        :state="paymentState"
        :dashboard-url="dashboardUrl"
        :content-shown="!!access"
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
        @canceled="execute"
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
        @canceled="execute"
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
  // Held back until the token's payment, if any, is settled: loading can spend
  // a view, and before then it would only report the old expiry.
  { getCachedData: () => undefined, immediate: false },
);

const { state: paymentState, dashboardUrl } = usePaymentCheck(token, execute);

// Only a payment being processed is worth a word; the check itself happens on
// every load and hides behind the usual loader.
const paymentMessage = computed(() => paymentState.value === 'pending' ? t('public_payment_pending') : null);

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
