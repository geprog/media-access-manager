<template>
  <div v-if="notices?.length" class="mx-auto mb-6 flex max-w-6xl flex-col gap-3">
    <!-- Payments the app could not settle on its own: one paid for a link
         that was deleted meanwhile, to be refunded in Mollie, or one whose
         money went back, whose access was withdrawn. Shown until dismissed. -->
    <UAlert
      v-for="notice in notices"
      :key="notice.paymentId"
      role="alert"
      :color="notice.kind === 'unapplied' ? 'warning' : 'neutral'"
      variant="subtle"
      icon="i-heroicons-banknotes"
      :title="$t(notice.kind === 'unapplied' ? 'payment_notice_unapplied' : 'payment_notice_reverted', { description: notice.description })"
      :description="formatDate(notice.createdAt)"
      :actions="actionsFor(notice)"
    />
  </div>
</template>

<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui';

interface PaymentNotice {
  paymentId: string
  kind: 'unapplied' | 'reverted'
  description: string
  dashboardUrl: string | null
  createdAt: string
}

const { t, locale } = useI18n();
const route = useRoute();

const { data: notices, refresh } = useFetch<PaymentNotice[]>('/api/payments/notices');

// A webhook can arrive while the admin works; every page they open looks again.
watch(() => route.path, () => refresh());

function formatDate(value: string) {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function actionsFor(notice: PaymentNotice): ButtonProps[] {
  const actions: ButtonProps[] = [];
  if (notice.dashboardUrl) {
    actions.push({
      label: t('public_payment_admin_dashboard'),
      icon: 'i-heroicons-arrow-top-right-on-square',
      to: notice.dashboardUrl,
      external: true,
      target: '_blank',
      variant: 'outline',
      color: 'neutral',
    });
  }
  actions.push({
    label: t('payment_notice_dismiss'),
    icon: 'i-heroicons-check',
    variant: 'ghost',
    color: 'neutral',
    onClick: () => dismiss(notice.paymentId),
  });
  return actions;
}

async function dismiss(paymentId: string) {
  await $fetch(`/api/payments/notices/${encodeURIComponent(paymentId)}/dismiss`, { method: 'POST' });
  await refresh();
}
</script>
