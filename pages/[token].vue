<template>
  <div class="flex min-h-screen flex-col items-center justify-center p-4">
    <div v-if="loading" class="text-center">
      <UIcon name="i-heroicons-arrow-path" class="h-12 w-12 animate-spin text-primary" />
      <p class="mt-4">
        {{ $t('public_loading') }}
      </p>
    </div>
    <div v-else-if="!mediaAccess" class="max-w-md text-center">
      <UIcon name="i-heroicons-exclamation-triangle" class="mx-auto h-16 w-16 text-amber-500" />
      <!-- An expired link still names its video, so the visitor knows which
           access they lost and what they are asking for. -->
      <h1 class="mt-4 text-xl font-semibold">
        {{ deniedTitle ?? errorMessage }}
      </h1>
      <p v-if="deniedTitle" class="mt-2 text-muted">
        {{ errorMessage }}
      </p>
      <!-- An expired link is the one dead end a visitor can do something about,
           so it offers the way out instead of only naming the problem. -->
      <template v-if="tokenExpired">
        <UButton
          v-if="mediaDetailsLink"
          class="mt-4"
          icon="i-heroicons-arrow-top-right-on-square"
          :to="mediaDetailsLink"
          :label="$t('public_open_media_details')"
        />
        <UButton
          v-else-if="!loggedIn && requestAccessLink"
          class="mt-4"
          icon="i-heroicons-envelope"
          :to="requestAccessLink"
          external
          :label="$t('public_request_access')"
        />
        <p v-else-if="!loggedIn" class="mt-2">
          {{ $t('public_contact_support') }}
        </p>
      </template>
    </div>
    <div v-else class="w-full max-w-4xl">
      <!-- Doubles as the page header: a visitor arriving from a QR code should
           see what they are about to watch and how long they have for it
           before the player. -->
      <header class="mb-6 flex flex-col items-center gap-3 border-b border-default pb-5 text-center">
        <h1 class="text-2xl font-bold sm:text-3xl">
          {{ mediaAccess.title }}
        </h1>
        <div class="flex flex-wrap items-center justify-center gap-2">
          <UBadge
            v-if="availabilityText"
            color="neutral"
            variant="subtle"
            size="lg"
            icon="i-heroicons-clock"
            :label="availabilityText"
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
      </header>
      <div
        v-if="embed && (embed.type === 'video' || embed.type === 'rich')"
        class="relative w-full overflow-hidden rounded-lg bg-black"
        :style="{ paddingBottom: embed?.type === 'video' && embed.width && embed.height ? `${(embed.height / embed.width) * 100}%` : '56.25%' }"
      >
        <div
          class="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full"
          v-html="embed?.html"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getRemainingTime, getRemainingViews } from '~/utils/accessWindow';
import { buildMailtoLink } from '~/utils/mailto';

definePageMeta({
  public: true,
});

const route = useRoute();
const { t, locale } = useI18n();

const token = computed(() => route.params.token as string);

const { data: mediaAccess, error, status: mediaAccessStatus } = useFetch(`/api/access/${encodeURIComponent(token.value)}`);

const loading = computed(() => mediaAccessStatus.value === 'pending');

const embed = computed(() => mediaAccess.value?.embed);

const { loggedIn } = useUserSession();

const denial = computed(() => {
  const body = error.value?.data as {
    data?: { reason?: string, title?: string | null, mediaId?: string | null }
  } | undefined;
  return body?.data;
});

const denialReason = computed(() => denial.value?.reason);

/** The video an expired link pointed at; unknown for a link that never worked. */
const deniedTitle = computed(() => denial.value?.title ?? null);

/**
 * An admin opening an expired link is checking their own token, so they get the
 * way into the media — issuing a fresh token is theirs to do, not to request.
 */
const mediaDetailsLink = computed(() => {
  const mediaId = denial.value?.mediaId;
  return loggedIn.value && mediaId ? `/media/${mediaId}` : null;
});

/**
 * The token was accepted but the provider could not deliver the media, so the
 * visitor should not be told their link is broken.
 */
const mediaUnavailable = computed(() => denialReason.value === 'media_unavailable');

/** The link itself ran out: its date passed or its views were used up. */
const tokenExpired = computed(() => denialReason.value === 'token_expired');

const errorMessage = computed(() => {
  if (mediaUnavailable.value) {
    return t('public_media_unavailable');
  }
  return tokenExpired.value ? t('public_token_expired') : t('public_invalid_token');
});

const { supportEmail } = useRuntimeConfig().public;

/**
 * Pre-fills the mail with the link the visitor came from, so support can look
 * the token up without asking them to copy anything out of the address bar.
 */
const requestAccessLink = computed(() => {
  const url = import.meta.client ? window.location.href : `/${token.value}`;
  return buildMailtoLink(supportEmail, {
    subject: t('public_request_access_subject'),
    body: deniedTitle.value
      ? t('public_request_access_body_with_title', { url, title: deniedTitle.value })
      : t('public_request_access_body', { url }),
  });
});

/**
 * Someone may leave the page open far longer than their access lasts, so the
 * remaining time is recomputed instead of frozen at load. Half a minute keeps
 * the wording honest without re-rendering for a display counted in days.
 */
const REMAINING_TIME_REFRESH_MS = 30 * 1000;
const now = ref(new Date());
let ticker: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  ticker = setInterval(() => {
    now.value = new Date();
  }, REMAINING_TIME_REFRESH_MS);
});

onBeforeUnmount(() => clearInterval(ticker));

const expiresAt = computed(() => {
  const iso = mediaAccess.value?.access.expiresAt;
  return iso ? new Date(iso) : null;
});

const remainingViews = computed(() => {
  const access = mediaAccess.value?.access;
  return access ? getRemainingViews(access.usageLimit, access.usageCount) : null;
});

const availabilityText = computed(() => {
  if (!expiresAt.value) {
    // A usage-limited link does run out, just by views rather than by time, so
    // promising it never expires would contradict the count beside it.
    return remainingViews.value === null ? t('public_access_no_expiry') : null;
  }
  const remaining = getRemainingTime(expiresAt.value, now.value);
  if (!remaining) {
    return t('public_access_expired');
  }
  return t('public_access_expires', {
    date: expiresAt.value.toLocaleString(locale.value, { dateStyle: 'long', timeStyle: 'short' }),
    duration: new Intl.NumberFormat(locale.value, {
      style: 'unit',
      unit: remaining.unit,
      unitDisplay: 'long',
    }).format(remaining.value),
  });
});
</script>
