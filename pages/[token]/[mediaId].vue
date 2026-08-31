<template>
  <div class="flex min-h-screen flex-col items-center justify-center p-4">
    <PublicAccessLoading v-if="loading" />
    <PublicAccessDenied
      v-else-if="!access"
      :token="token"
      :reason="denial?.reason"
      :title="denial?.title"
      :media-id="denial?.mediaId"
      :group-id="denial?.groupId"
    >
      <template #actions>
        <UButton variant="link" :to="groupLink" :label="$t('public_group_back')" />
      </template>
    </PublicAccessDenied>
    <PublicMediaPlayer
      v-else
      :title="access.title"
      :embed="access.embed"
      :expires-at="access.access.expiresAt"
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
definePageMeta({
  public: true,
});

const route = useRoute();

const token = computed(() => route.params.token as string);
const mediaId = computed(() => route.params.mediaId as string);

/**
 * Opening this page is what spends a view, so it is fetched fresh every time
 * rather than served from the cache of an earlier visit.
 */
const { data: access, error, status } = useFetch(
  () => `/api/access/${encodeURIComponent(token.value)}/${encodeURIComponent(mediaId.value)}`,
  { getCachedData: () => undefined },
);

const loading = computed(() => status.value === 'pending');

const groupLink = computed(() => `/${encodeURIComponent(token.value)}`);

const denial = computed(() => {
  const body = error.value?.data as {
    data?: { reason?: string, title?: string | null, mediaId?: string | null, groupId?: string | null }
  } | undefined;
  return body?.data;
});
</script>
