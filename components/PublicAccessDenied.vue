<template>
  <div class="max-w-md text-center">
    <UIcon name="i-heroicons-exclamation-triangle" class="mx-auto h-16 w-16 text-amber-500" />
    <!-- An expired link still names what it led to, so the visitor knows which
         access they lost and what they are asking for. -->
    <h1 class="mt-4 text-xl font-semibold">
      {{ title ?? message }}
    </h1>
    <p v-if="title" class="mt-2 text-muted">
      {{ message }}
    </p>
    <!-- An expired link is the one dead end a visitor can do something about,
         so it offers the way out instead of only naming the problem. -->
    <template v-if="expired">
      <UButton
        v-if="adminLink"
        class="mt-4"
        icon="i-heroicons-arrow-top-right-on-square"
        :to="adminLink"
        :label="adminLinkLabel"
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
    <!-- A media of a group can run out while the token itself is still good,
         so the page it was reached from stays worth offering. -->
    <div class="mt-2">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { buildMailtoLink } from '~/utils/mailto';

const props = defineProps<{
  /** The token the visitor arrived with, quoted in the support mail. */
  token: string
  /** Why access was denied, as reported by the access endpoint. */
  reason?: string
  /** Media title or group name, only known for a link that once worked. */
  title?: string | null
  /** Set for an admin only, so they land on their own media instead of support. */
  mediaId?: string | null
  /** The same for a group token. */
  groupId?: string | null
}>();

const { t } = useI18n();
const { loggedIn } = useUserSession();

/**
 * The token was accepted but the provider could not deliver the media, so the
 * visitor should not be told their link is broken.
 */
const mediaUnavailable = computed(() => props.reason === 'media_unavailable');

/** The link itself ran out: its date passed or its views were used up. */
const expired = computed(() => props.reason === 'token_expired');

const message = computed(() => {
  if (mediaUnavailable.value) {
    return t('public_media_unavailable');
  }
  return expired.value ? t('public_token_expired') : t('public_invalid_token');
});

/**
 * An admin opening an expired link is checking their own token, so they get
 * the way into the media or group — issuing a fresh token is theirs to do, not
 * to request.
 */
const adminLink = computed(() => {
  if (!loggedIn.value) {
    return null;
  }
  if (props.groupId) {
    return `/groups/${props.groupId}`;
  }
  return props.mediaId ? `/media/${props.mediaId}` : null;
});

const adminLinkLabel = computed(() =>
  props.groupId && loggedIn.value ? t('public_open_group_details') : t('public_open_media_details'),
);

const { supportEmail } = useRuntimeConfig().public;

/**
 * Pre-fills the mail with the link the visitor came from, so support can look
 * the token up without asking them to copy anything out of the address bar.
 */
const requestAccessLink = computed(() => {
  const url = import.meta.client ? window.location.href : `/${props.token}`;
  return buildMailtoLink(supportEmail, {
    subject: t('public_request_access_subject'),
    body: props.title
      ? t('public_request_access_body_with_title', { url, title: props.title })
      : t('public_request_access_body', { url }),
  });
});
</script>
