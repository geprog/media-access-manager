<template>
  <div>
    <h2 class="mb-2 text-lg font-semibold">
      {{ $t('purchase_title') }}
    </h2>
    <p class="mb-3 text-sm text-muted">
      {{ groupId ? $t('purchase_hint_group') : $t('purchase_hint_media') }}
    </p>
    <!-- Prices saved while purchasing is off are kept, but no visitor sees
         them — worth saying, or the admin looks for a bug that is not there. -->
    <UAlert
      v-if="settings && !settings.enabled"
      class="mb-3"
      color="neutral"
      variant="subtle"
      icon="i-heroicons-information-circle"
      :title="$t('purchase_disabled')"
    />
    <form class="flex flex-wrap items-end gap-4" @submit.prevent="save">
      <UFormField :label="$t('purchase_price_month')" name="priceMonth">
        <UInputNumber
          v-model="priceMonth"
          :min="0"
          :step="step"
          :format-options="formatOptions"
          :increment="false"
          :decrement="false"
          :placeholder="$t('purchase_price_placeholder')"
        />
      </UFormField>
      <UFormField :label="$t('purchase_price_year')" name="priceYear">
        <UInputNumber
          v-model="priceYear"
          :min="0"
          :step="step"
          :format-options="formatOptions"
          :increment="false"
          :decrement="false"
          :placeholder="$t('purchase_price_placeholder')"
        />
      </UFormField>
      <UButton type="submit" variant="outline" :loading="saving" :label="$t('purchase_save')" />
    </form>
  </div>
</template>

<script setup lang="ts">
import { currencyFractionDigits, fromMinorUnits, toMinorUnits } from '~/utils/money';

/** Exactly one of the two is set: the prices belong to a media or to a group. */
const props = defineProps<{
  mediaId?: string
  groupId?: string
  /** Stored prices in minor units, `null` when that period is not for sale. */
  priceMonth: number | null
  priceYear: number | null
}>();

const emit = defineEmits<{ saved: [] }>();

const { t } = useI18n();
const toast = useToast();
const { currency } = useRuntimeConfig().public.payment;

const { data: settings } = useFetch('/api/payments/settings');

const formatOptions = { style: 'currency', currency } as const;
const step = 1 / 10 ** currencyFractionDigits(currency);

// Edited in whole currency amounts, stored in minor units: an admin types
// 9.99, the database keeps 999.
const priceMonth = ref(toAmount(props.priceMonth));
const priceYear = ref(toAmount(props.priceYear));
const saving = ref(false);

function toAmount(minorUnits: number | null) {
  return minorUnits == null ? null : fromMinorUnits(minorUnits, currency);
}

function toStored(amount: number | null | undefined) {
  // An emptied field takes the period off sale rather than making it free.
  return amount == null ? null : toMinorUnits(amount, currency);
}

async function save() {
  saving.value = true;
  try {
    const url = props.groupId ? `/api/groups/${props.groupId}` : `/api/media/${props.mediaId}`;
    await $fetch(url, {
      method: 'PATCH',
      body: { priceMonth: toStored(priceMonth.value), priceYear: toStored(priceYear.value) },
    });
    toast.add({ title: t('purchase_saved'), color: 'success' });
    emit('saved');
  }
  finally {
    saving.value = false;
  }
}
</script>
