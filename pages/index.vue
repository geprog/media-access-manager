<template>
  <div class="mx-auto max-w-6xl">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        {{ $t('media_list_title') }}
      </h1>
      <UButton
        :label="$t('media_add')"
        @click="showAddModal = true"
      />
    </div>
    <UCard v-if="media && media.length > 0">
      <UTable
        :data="media"
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
          <form @submit.prevent="handleAddMedia">
            <UFormField :label="$t('media_title')">
              <UInput v-model="addForm.title" required />
            </UFormField>
            <UFormField label="Media ID (e.g. Vimeo video ID)">
              <UInput v-model="addForm.id" required placeholder="123456789" />
            </UFormField>
            <UFormField :label="$t('media_provider')">
              <USelect
                v-model="addForm.providerId"
                :items="[{ label: 'Vimeo', value: 'vimeo' }]"
              />
            </UFormField>
            <UButton type="submit" class="mt-4">
              {{ $t('media_add') }}
            </UButton>
          </form>
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

interface MediaRow { id: string, title: string, providerId: string }

const { data: media, refresh: refreshMedia } = useFetch('/api/media');

const showAddModal = ref(false);
const addForm = ref({
  id: '',
  title: '',
  providerId: 'vimeo',
});

const columns: TableColumn<MediaRow>[] = [
  { accessorKey: 'title', header: t('media_title') },
  {
    accessorKey: 'providerId',
    header: t('media_provider'),
    cell: ({ row }) => h(UBadge, { label: row.getValue('providerId'), variant: 'subtle' }),
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
    body: {
      id: addForm.value.id,
      title: addForm.value.title,
      providerId: addForm.value.providerId,
      providerConfig: { vimeoId: addForm.value.id },
    },
  });
  showAddModal.value = false;
  addForm.value = { id: '', title: '', providerId: 'vimeo' };
  await refreshMedia();
}
</script>
