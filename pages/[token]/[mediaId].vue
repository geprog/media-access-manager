<template>
  <div class="flex min-h-screen flex-col items-center justify-center p-4">
    <!-- A payment being processed holds the page back, as on the token page. -->
    <PublicPaymentNotice
      v-if="!loading"
      class="mb-6"
      :token="token"
      :state="paymentState"
      :dashboard-url="dashboardUrl"
      :content-shown="!!access"
    />
    <template v-if="loading">
      <PublicAccessLoading :message="paymentMessage ?? undefined" />
      <PublicPaymentNotice
        class="mt-6"
        :token="token"
        :state="paymentState"
        :dashboard-url="dashboardUrl"
        :content-shown="!!access"
      />
    </template>
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
    >
      <template #actions>
        <UButton variant="link" :to="groupLink" :label="$t('public_group_back')" />
      </template>
    </PublicAccessDenied>
    <!-- Watching would spend one of this media's limited views or start the
         access window, so the visitor is asked first. -->
    <PublicViewConfirmation
      v-else-if="access.confirmationRequired"
      :title="access.title"
      :expires-at="access.access.expiresAt"
      :valid-for="access.access.validFor"
      :usage-limit="access.access.usageLimit"
      :usage-count="access.access.usageCount"
      :loading="confirming"
      @confirm="confirm"
    >
      <template #actions>
        <UButton
          variant="link"
          icon="i-heroicons-arrow-left"
          :to="groupLink"
          :label="$t('public_group_back')"
        />
      </template>
    </PublicViewConfirmation>
    <PublicMediaPlayer
      v-else
      :title="access.title"
      :embed="access.embed"
      :expires-at="access.access.expiresAt"
      :valid-for="access.access.validFor"
      :usage-limit="access.access.usageLimit"
      :usage-count="access.access.usageCount"
    >
      <template #actions>
        <UButton
          variant="link"
          icon="i-heroicons-arrow-left"
          :to="groupLink"
          :label="$t('public_group_back')"
        />
      </template>
    </PublicMediaPlayer>
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
const mediaId = computed(() => route.params.mediaId as string);

const accessUrl = () => `/api/access/${encodeURIComponent(token.value)}/${encodeURIComponent(mediaId.value)}` as const;

/**
 * Opening this page can spend a view, so it is fetched fresh every time rather
 * than served from the cache of an earlier visit — and only once the token's
 * payment, if any, is settled.
 */
const { data: access, error, status, execute } = useFetch(
  accessUrl,
  { getCachedData: () => undefined, immediate: false },
);

const { state: paymentState, dashboardUrl } = usePaymentCheck(token, execute);

const paymentMessage = computed(() => paymentState.value === 'pending' ? t('public_payment_pending') : null);

const { confirming, error: confirmError, confirm } = useViewConfirmation(accessUrl, access);

const loading = computed(() => paymentMessage.value !== null || status.value === 'pending' || status.value === 'idle');

const groupLink = computed(() => `/${encodeURIComponent(token.value)}`);

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
</script>
