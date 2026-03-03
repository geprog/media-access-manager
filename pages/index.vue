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
            <UFormField :label="$t('media_title')">
              <UInput v-model="addMediaData.title" required />
            </UFormField>
            <UFormField :label="$t('media_provider')">
              <USelect
                v-model="addMediaData.providerConfig.providerId"
                :items="[{ label: 'Vimeo', value: 'vimeo' }]"
              />
            </UFormField>
            <template v-if="addMediaData.providerConfig.providerId === 'vimeo'">
              <UFormField label="Video ID">
                <UInput v-model="addMediaData.providerConfig.videoId" required placeholder="123456789" />
              </UFormField>
            </template>
            <UButton type="submit" class="mt-4">
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
import type { Media, MediaInsert } from '~/server/db/schema';
import { h, resolveComponent } from 'vue';

const UButton = resolveComponent('UButton');
const UBadge = resolveComponent('UBadge');
const { t } = useI18n();

const { data: media, refresh: refreshMedia } = useFetch('/api/media');

const showAddModal = ref(false);
const addMediaData = ref<MediaInsert>({
  id: '',
  title: '',
  providerConfig: { providerId: 'vimeo', videoId: '' },
});

function openAddModal() {
  showAddModal.value = true;
  addMediaData.value = {
    id: '',
    title: '',
    providerConfig: { providerId: 'vimeo', videoId: '' },
  };
}

const columns: TableColumn<Omit<Media, 'createdAt'>>[] = [
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
  await $fetch('/api/media', {
    method: 'POST',
    body: addMediaData.value,
  });
  showAddModal.value = false;
  await refreshMedia();
}
</script>
