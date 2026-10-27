<template>
  <div v-if="notice || adminLink" class="flex w-full max-w-md flex-col items-center gap-3">
    <UAlert
      v-if="notice"
      color="warning"
      variant="subtle"
      icon="i-heroicons-exclamation-circle"
      :title="notice.title"
      :description="notice.description"
      :actions="notice.actions"
      :ui="{ actions: 'justify-center' }"
    />
    <!-- Admins checking a link follow its payment where it lives; visitors
         never get this URL from the server. -->
    <UButton
      v-if="adminLink"
      variant="link"
      icon="i-heroicons-arrow-top-right-on-square"
      :to="adminLink"
      external
      target="_blank"
      :label="$t('public_payment_admin_dashboard')"
    />
  </div>
</template>

<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui';
import type { PaymentCheckState } from '~/composables/usePaymentCheck';
import { buildMailtoLink } from '~/utils/mailto';

const props = defineProps<{
  /** The token the visitor arrived with, quoted in the support mail. */
  token: string
  state: PaymentCheckState
  /** The payment in the Mollie dashboard, only ever set for an admin. */
  dashboardUrl: string | null
  /** Whether the page shows the content, which makes a late payment moot. */
  contentShown: boolean
}>();

const { t } = useI18n();
const { loggedIn } = useUserSession();
const { supportEmail } = useRuntimeConfig().public;

const adminLink = computed(() => loggedIn.value ? props.dashboardUrl : null);

/**
 * Pre-fills the mail with the link the visitor came from, so support can find
 * the payment through the token without asking them for anything.
 */
const supportLink = computed(() => {
  const url = import.meta.client ? window.location.href : `/${props.token}`;
  return buildMailtoLink(supportEmail, {
    subject: t('public_payment_support_subject'),
    body: t('public_payment_support_body', { url }),
  });
});

const notice = computed(() => {
  if (props.state === 'failed') {
    return { title: t('public_payment_failed') };
  }
  // Only worth saying while the token still looks expired; once the webhook
  // got through, the content is the answer.
  if (props.state !== 'timeout' || props.contentShown) {
    return null;
  }
  // Some payments take longer than any page should wait. Nothing is lost by
  // leaving: the token is extended whenever Mollie confirms the payment.
  const actions: ButtonProps[] = supportLink.value
    ? [{ label: t('public_payment_support'), icon: 'i-heroicons-envelope', to: supportLink.value, external: true, variant: 'outline', color: 'warning' }]
    : [];
  return {
    title: t('public_payment_timeout'),
    description: t('public_payment_timeout_hint'),
    actions,
  };
});
</script>
