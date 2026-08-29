<template>
  <div class="mx-auto max-w-6xl">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        {{ $t('media_list_title') }}
      </h1>
      <UButton
        :label="$t('media_add')"
        @click="openAddModal"
      />
    </div>
    <UCard v-if="media && media.length > 0">
      <UTable
        :data="media ?? []"
        :columns="columns"
      />
    </UCard>
    <UCard v-else>
      <p class="py-8 text-center text-gray-500 dark:text-gray-400">
        {{ $t('media_empty') }}
      </p>
    </UCard>

    <UModal v-model:open="showAddModal">
      <template #content>
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">
              {{ $t('media_add') }}
            </h2>
          </template>
          <UForm class="flex flex-col gap-6" @submit.prevent="handleAddMedia">
            <UFormField :label="$t('media_provider')">
              <USelect
                v-model="providerId"
                :items="[{ label: 'Vimeo', value: 'vimeo' }]"
              />
            </UFormField>
            <div class="flex flex-col gap-1">
              <UFormField
                v-if="!manualEntry"
                :label="$t('media_video')"
                :hint="availableHint"
              >
                <USelectMenu
                  v-model="selectedVideoId"
                  class="w-full"
                  :aria-label="$t('media_video')"
                  value-key="value"
                  :items="availableItems"
                  :loading="availableStatus === 'pending'"
                  :placeholder="$t('media_video_select_placeholder')"
                  :search-input="{ placeholder: $t('media_video_search_placeholder') }"
                />
              </UFormField>
              <UFormField v-else :label="$t('media_video_id')">
                <UInput v-model="manualVideoId" required placeholder="123456789" />
              </UFormField>
              <UButton
                variant="link"
                size="xs"
                class="self-start p-0"
                :label="manualEntry ? $t('media_video_choose_from_library') : $t('media_video_enter_manually')"
                @click="toggleManualEntry"
              />
            </div>
            <UFormField :label="$t('media_title')">
              <UInput v-model="title" required />
            </UFormField>
            <UButton type="submit" class="mt-4" :disabled="!canSubmit">
              {{ $t('media_add') }}
            </UButton>
          </UForm>
        </UCard>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';
import { h, resolveComponent } from 'vue';

const UButton = resolveComponent('UButton');
const UBadge = resolveComponent('UBadge');
const { t } = useI18n();

const { data: media, refresh: refreshMedia } = useFetch('/api/media');

type MediaRow = NonNullable<typeof media.value>[number];

const showAddModal = ref(false);
const providerId = ref('vimeo');
const title = ref('');
const selectedVideoId = ref<string | undefined>(undefined);
const manualEntry = ref(false);
const manualVideoId = ref('');

const {
  data: availableMedia,
  status: availableStatus,
  error: availableError,
  execute: loadAvailableMedia,
} = useFetch(() => `/api/providers/${providerId.value}/available-media`, {
  immediate: false,
  default: () => [],
});

const availableItems = computed(() =>
  availableMedia.value.map(item => ({ label: item.title, value: item.id })),
);

const selectedItem = computed(() =>
  availableMedia.value.find(item => item.id === selectedVideoId.value),
);

const availableHint = computed(() => {
  if (availableStatus.value === 'pending') {
    return undefined;
  }
  if (availableError.value) {
    return t('media_video_load_error');
  }
  if (availableItems.value.length === 0) {
    return t('media_video_none_available');
  }
  return undefined;
});

const providerConfig = computed(() =>
  manualEntry.value
    ? { providerId: providerId.value, videoId: manualVideoId.value.trim() }
    : selectedItem.value?.providerConfig,
);

const canSubmit = computed(() =>
  !!title.value.trim()
  && (manualEntry.value ? !!manualVideoId.value.trim() : !!selectedItem.value),
);

// Prefill the title from the picked video, but never overwrite what the admin typed.
let autoFilledTitle = '';
watch(selectedItem, (item) => {
  if (item && (!title.value.trim() || title.value === autoFilledTitle)) {
    title.value = item.title;
    autoFilledTitle = item.title;
  }
});

function openAddModal() {
  showAddModal.value = true;
  title.value = '';
  selectedVideoId.value = undefined;
  manualEntry.value = false;
  manualVideoId.value = '';
  autoFilledTitle = '';
  // Refetch on every open so media added in the meantime drops off the list.
  void loadAvailableMedia();
}

function toggleManualEntry() {
  manualEntry.value = !manualEntry.value;
  selectedVideoId.value = undefined;
  manualVideoId.value = '';
}

const columns: TableColumn<MediaRow>[] = [
  { accessorKey: 'title', header: t('media_title') },
  {
    id: 'providerId',
    accessorFn: row => row.providerConfig.providerId,
    header: t('media_provider'),
    cell: ({ getValue }) => {
      return h(UBadge, { label: getValue(), variant: 'subtle' });
    },
  },
  {
    id: 'actions',
    header: t('media_actions'),
    cell: ({ row }) => h(UButton, {
      variant: 'ghost',
      size: 'sm',
      label: t('media_view_tokens'),
      to: `/media/${row.original.id}`,
    }),
  },
];

async function handleAddMedia() {
  if (!canSubmit.value) {
    return;
  }
  await $fetch('/api/media', {
    method: 'POST',
    body: { title: title.value.trim(), providerConfig: providerConfig.value },
  });
  showAddModal.value = false;
  await refreshMedia();
}
</script>
