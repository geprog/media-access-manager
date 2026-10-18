<template>
  <div class="w-full max-w-xl">
    <!-- Same header as the player, so the visitor already sees what the link
         leads to and how long it lasts before deciding to spend anything. -->
    <header class="mb-6 flex flex-col items-center gap-3 border-b border-default pb-5 text-center">
      <h1 class="text-2xl font-bold sm:text-3xl">
        {{ title }}
      </h1>
      <div class="flex flex-wrap items-center justify-center gap-2">
        <UBadge
          v-if="expiryLabel"
          color="neutral"
          variant="subtle"
          size="lg"
          icon="i-heroicons-clock"
          :label="expiryLabel"
        />
        <UBadge
          v-if="viewsLeft !== null"
          color="neutral"
          variant="subtle"
          size="lg"
          icon="i-heroicons-eye"
          :label="$t('public_group_views_left', viewsLeft)"
        />
      </div>
    </header>
    <UCard :ui="{ body: 'flex flex-col items-center gap-3 text-center' }">
      <p v-if="activationEnd && validFor">
        {{ $t('public_confirm_starts_access', {
          duration: formatDuration(validFor),
          date: activationEnd.toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' }),
        }) }}
      </p>
      <p v-if="viewsLeft !== null">
        {{ $t('public_confirm_uses_view', viewsLeft) }}
      </p>
      <p class="text-sm text-muted">
        {{ $t('public_confirm_nothing_spent') }}
      </p>
      <UButton
        class="mt-2"
        size="xl"
        icon="i-heroicons-play"
        :loading="loading"
        :label="activationEnd ? $t('public_confirm_start') : $t('public_confirm_watch')"
        @click="emit('confirm')"
      />
    </UCard>
    <div class="mt-4 text-center">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ValidityDuration } from '~/utils/accessWindow';
import { addValidity, getRemainingViews } from '~/utils/accessWindow';

const props = defineProps<{
  title: string
  /** ISO timestamp the token expires at, `null` when it has none (yet). */
  expiresAt?: string | null
  /** How long a token not used before lasts from its first use. */
  validFor?: ValidityDuration | null
  usageLimit?: number | null
  /** Views spent before this one, which is not booked yet. */
  usageCount?: number
  /** The confirmed view is being booked. */
  loading?: boolean
}>();

const emit = defineEmits<{
  confirm: []
}>();

const { locale } = useI18n();
const formatDuration = useDurationFormatter();
const now = useNow();

const expiresAtDate = computed(() => (props.expiresAt ? new Date(props.expiresAt) : null));
const expiryLabel = useExpiryLabel(
  expiresAtDate,
  () => props.usageLimit != null,
  () => props.validFor ?? null,
);

// Nothing is booked yet, so the count is what the visitor has before watching.
const viewsLeft = computed(() =>
  getRemainingViews(props.usageLimit ?? null, props.usageCount ?? 0),
);

/**
 * When the access would end if started right now, so the visitor can judge
 * whether now is a good time. `null` once the window is already running.
 */
const activationEnd = computed(() =>
  !props.expiresAt && props.validFor ? addValidity(now.value, props.validFor) : null,
);
</script>
