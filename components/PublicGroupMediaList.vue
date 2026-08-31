<template>
  <div class="w-full max-w-4xl">
    <header class="mb-6 flex flex-col items-center gap-3 border-b border-default pb-5 text-center">
      <h1 class="text-2xl font-bold sm:text-3xl">
        {{ title }}
      </h1>
      <UBadge
        v-if="expiryLabel"
        color="neutral"
        variant="subtle"
        size="lg"
        icon="i-heroicons-clock"
        :label="expiryLabel"
      />
      <p class="text-muted">
        {{ $t('public_group_intro') }}
      </p>
    </header>
    <!-- Every media of the group can be gone, e.g. deleted after the link was
         handed out, and an empty page would leave the visitor guessing. -->
    <p v-if="media.length === 0" class="text-center text-muted">
      {{ $t('public_group_empty') }}
    </p>
    <ul v-else class="grid items-stretch gap-4 sm:grid-cols-2">
      <li v-for="entry in media" :key="entry.id" class="h-full">
        <UCard
          class="h-full"
          :ui="{ root: 'flex flex-col', body: 'flex flex-1 flex-col gap-3' }"
          :class="entry.blockedBy ? 'opacity-75' : undefined"
        >
          <h2 class="font-semibold">
            {{ entry.title }}
          </h2>
          <UBadge
            v-if="statusLabel(entry)"
            class="self-start"
            :color="entry.blockedBy ? 'neutral' : 'primary'"
            variant="subtle"
            :icon="entry.blockedBy ? 'i-heroicons-lock-closed' : 'i-heroicons-eye'"
            :label="statusLabel(entry)"
          />
          <!-- A media the token can no longer open keeps its place in the list
               so the visitor sees what they had, but must not look like a way in. -->
          <UButton
            class="mt-auto justify-center"
            block
            :icon="entry.blockedBy ? 'i-heroicons-lock-closed' : 'i-heroicons-play'"
            :color="entry.blockedBy ? 'neutral' : 'primary'"
            :variant="entry.blockedBy ? 'subtle' : 'solid'"
            :disabled="!!entry.blockedBy"
            :to="entry.blockedBy ? undefined : `/${encodeURIComponent(token)}/${entry.id}`"
            :label="entry.blockedBy ? $t('public_group_unavailable') : $t('public_group_watch')"
          />
        </UCard>
      </li>
    </ul>
    <!-- Some media of a group can run out while others are still open, so the
         visitor is told where to turn instead of being left with dead cards. -->
    <p v-if="hasBlockedMedia" class="mt-6 text-center text-sm text-muted">
      {{ $t('public_group_blocked_hint') }}
      <ULink v-if="requestAccessLink" :to="requestAccessLink" external class="text-primary">
        {{ $t('public_request_access') }}
      </ULink>
    </p>
  </div>
</template>

<script setup lang="ts">
import { getRemainingViews } from '~/utils/accessWindow';
import { buildMailtoLink } from '~/utils/mailto';

export interface GroupMediaEntry {
  id: string
  title: string
  /** Why this media cannot be opened, `null` while it still can. */
  blockedBy: string | null
  usageLimit: number | null
  usageCount: number
}

const props = defineProps<{
  token: string
  /** The group's name, which is all the visitor knows it by. */
  title: string
  expiresAt?: string | null
  media: GroupMediaEntry[]
}>();

const { t } = useI18n();

const expiresAtDate = computed(() => (props.expiresAt ? new Date(props.expiresAt) : null));
// A group token's date window is shared, so a single label covers the list.
const expiryLabel = useExpiryLabel(expiresAtDate, () => props.media.some(entry => entry.usageLimit != null));

const hasBlockedMedia = computed(() => props.media.some(entry => entry.blockedBy));

const BLOCKED_LABELS: Record<string, string> = {
  usage_limit_reached: 'public_group_used_up',
  expired: 'public_group_expired',
  not_started: 'public_group_not_started',
};

function statusLabel(entry: GroupMediaEntry): string | undefined {
  if (entry.blockedBy) {
    return t(BLOCKED_LABELS[entry.blockedBy] ?? 'public_group_used_up');
  }
  const remaining = getRemainingViews(entry.usageLimit, entry.usageCount);
  // An unlimited media needs no count; a badge saying nothing would be noise.
  return remaining === null ? undefined : t('public_group_views_left', remaining);
}

const { supportEmail } = useRuntimeConfig().public;

const requestAccessLink = computed(() => {
  const url = import.meta.client ? window.location.href : `/${props.token}`;
  return buildMailtoLink(supportEmail, {
    subject: t('public_request_access_subject'),
    body: t('public_request_access_body_with_title', { url, title: props.title }),
  });
});
</script>
