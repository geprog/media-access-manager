<template>
  <div class="mx-auto max-w-6xl flex flex-col">
    <UButton
      variant="outline"
      class="mb-4 mx-auto"
      to="/"
    >
      {{ $t('back_to_media_list') }}
    </UButton>
    <UCard v-if="media">
      <template #header>
        <div class="flex items-start justify-between gap-4">
          <h1 class="text-2xl font-bold">
            {{ media.title ?? '...' }}
          </h1>
          <MediaDeleteButton
            :media-id="id"
            :title="media.title ?? ''"
            @deleted="handleMediaDeleted"
          />
        </div>
      </template>
      <div class="space-y-6">
        <MediaAccessibilityCard
          :media-id="id"
          :provider-id="media.providerConfig?.providerId"
        />
        <div v-if="groups.length > 0">
          <h2 class="mb-2 text-lg font-semibold">
            {{ $t('media_groups') }}
          </h2>
          <!-- Tokens of these groups also unlock this media, so they are worth
               knowing about before changing or deleting it. -->
          <ul class="flex flex-wrap gap-2">
            <li v-for="group in groups" :key="group.id">
              <UButton
                variant="subtle"
                color="neutral"
                size="sm"
                :to="`/groups/${group.id}`"
                :label="group.name"
              />
            </li>
          </ul>
        </div>
        <TokenBatchesPanel :media-id="id" />
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();

const id = computed(() => route.params.id as string);
const { data: media } = useFetch(`/api/media/${id.value}`);
const { data: groups } = useFetch(`/api/media/${id.value}/groups`, { default: () => [] });

function handleMediaDeleted() {
  // The page's own media is gone, so there is nothing left to show here.
  return navigateTo('/');
}
</script>
