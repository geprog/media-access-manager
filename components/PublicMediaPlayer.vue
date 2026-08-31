<template>
  <div class="w-full max-w-4xl">
    <!-- Doubles as the page header: a visitor arriving from a QR code should
         see what they are about to watch and how long they have for it
         before the player. -->
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
          v-if="remainingViews !== null"
          color="neutral"
          variant="subtle"
          size="lg"
          icon="i-heroicons-eye"
          :label="$t('public_access_views_left', remainingViews)"
        />
      </div>
      <slot name="actions" />
    </header>
    <div
      v-if="embed && (embed.type === 'video' || embed.type === 'rich')"
      class="relative w-full overflow-hidden rounded-lg bg-black"
      :style="{ paddingBottom: aspectRatioPadding }"
    >
      <div
        class="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full"
        v-html="embed.html"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { getRemainingViews } from '~/utils/accessWindow';

/** As much of an oEmbed response as a player needs to render it. */
interface Embed {
  type: string
  html?: string
  width?: number
  height?: number
}

const props = defineProps<{
  title: string
  embed?: Embed | null
  /** ISO timestamp the token expires at, `null` when it never does. */
  expiresAt?: string | null
  usageLimit?: number | null
  usageCount?: number
}>();

const expiresAtDate = computed(() => (props.expiresAt ? new Date(props.expiresAt) : null));
const expiryLabel = useExpiryLabel(expiresAtDate, () => props.usageLimit != null);

const remainingViews = computed(() =>
  getRemainingViews(props.usageLimit ?? null, props.usageCount ?? 0),
);

const aspectRatioPadding = computed(() => {
  const { width, height } = props.embed ?? {};
  return width && height ? `${(height / width) * 100}%` : '56.25%';
});
</script>
