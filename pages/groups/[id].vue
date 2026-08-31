<template>
  <div class="mx-auto max-w-6xl flex flex-col">
    <UButton
      variant="outline"
      class="mb-4 mx-auto"
      to="/groups"
    >
      {{ $t('back_to_groups') }}
    </UButton>
    <UCard v-if="data">
      <template #header>
        <div class="flex items-start justify-between gap-4">
          <h1 class="text-2xl font-bold">
            {{ data.group.name }}
          </h1>
          <div class="flex items-center gap-2">
            <UButton
              variant="ghost"
              size="sm"
              icon="i-heroicons-pencil-square"
              :label="$t('group_edit')"
              @click="showEditModal = true"
            />
            <MediaGroupDeleteButton
              :group-id="id"
              :name="data.group.name"
              @deleted="handleGroupDeleted"
            />
          </div>
        </div>
      </template>
      <div class="space-y-6">
        <div>
          <h2 class="mb-2 text-lg font-semibold">
            {{ $t('group_media') }}
          </h2>
          <!-- A group token spends its limit on each of these separately, so
               the admin sees exactly what one token unlocks. -->
          <p class="mb-3 text-sm text-muted">
            {{ $t('group_media_hint') }}
          </p>
          <ul class="flex flex-wrap gap-2">
            <li v-for="item in data.media" :key="item.id">
              <UButton
                variant="subtle"
                color="neutral"
                size="sm"
                :to="`/media/${item.id}`"
                :label="item.title"
              />
            </li>
          </ul>
        </div>
        <TokenBatchesPanel :group-id="id" />
      </div>
    </UCard>

    <UModal v-model:open="showEditModal" :title="$t('group_edit')">
      <template #body>
        <MediaGroupForm
          v-if="showEditModal && data"
          :submit-label="$t('group_save')"
          :name="data.group.name"
          :media-ids="data.media.map(item => item.id)"
          :pending="saving"
          @submit="handleSave"
          @cancel="showEditModal = false"
        />
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();

const id = computed(() => route.params.id as string);
const { data, refresh } = useFetch(`/api/groups/${id.value}`);

const showEditModal = ref(false);
const saving = ref(false);

function handleGroupDeleted() {
  // The page's own group is gone, so there is nothing left to show here.
  return navigateTo('/groups');
}

async function handleSave(value: { name: string, mediaIds: string[] }) {
  saving.value = true;
  try {
    await $fetch(`/api/groups/${id.value}`, { method: 'PATCH', body: value });
    showEditModal.value = false;
    await refresh();
  }
  finally {
    saving.value = false;
  }
}
</script>
