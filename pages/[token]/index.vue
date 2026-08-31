<template>
  <div class="flex min-h-screen flex-col items-center p-4" :class="centered ? 'justify-center' : 'py-8'">
    <PublicAccessLoading v-if="loading" />
    <PublicAccessDenied
      v-else-if="!access"
      :token="token"
      :reason="denial?.reason"
      :title="denial?.title"
      :media-id="denial?.mediaId"
      :group-id="denial?.groupId"
    />
    <!-- A group token unlocks several media, so the visitor picks one instead
         of being dropped straight into a player. Nothing is spent here. -->
    <PublicGroupMediaList
      v-else-if="access.type === 'group'"
      :token="token"
      :title="access.title"
      :expires-at="access.access.expiresAt"
      :media="access.media"
    />
    <PublicMediaPlayer
      v-else
      :title="access.title"
      :embed="access.embed"
      :expires-at="access.access.expiresAt"
      :usage-limit="access.access.usageLimit"
      :usage-count="access.access.usageCount"
    />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  public: true,
});

const route = useRoute();

const token = computed(() => route.params.token as string);

const { data: access, error, status } = useFetch(
  () => `/api/access/${encodeURIComponent(token.value)}`,
  // Views a group token spent come back with this list, so returning here
  // after watching must not show the counts from before.
  { getCachedData: () => undefined },
);

const loading = computed(() => status.value === 'pending');

const denial = computed(() => {
  const body = error.value?.data as {
    data?: { reason?: string, title?: string | null, mediaId?: string | null, groupId?: string | null }
  } | undefined;
  return body?.data;
});

// A list needs the top of the page; a player or a short notice reads better
// in the middle of it.
const centered = computed(() => access.value?.type !== 'group');
</script>
