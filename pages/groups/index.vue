<template>
  <div class="mx-auto max-w-6xl">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        {{ $t('groups_title') }}
      </h1>
      <UButton
        :label="$t('group_add')"
        @click="showAddModal = true"
      />
    </div>
    <UCard v-if="groups.length > 0">
      <UTable
        :data="groups"
        :columns="columns"
        :ui="{ tbody: '[&>tr]:hover:bg-elevated/50', tr: 'relative' }"
      />
    </UCard>
    <UCard v-else>
      <p class="py-8 text-center text-gray-500 dark:text-gray-400">
        {{ $t('groups_empty') }}
      </p>
    </UCard>

    <UModal v-model:open="showAddModal" :title="$t('group_add')">
      <template #body>
        <MediaGroupForm
          v-if="showAddModal"
          :submit-label="$t('group_add')"
          :pending="creating"
          @submit="handleCreateGroup"
          @cancel="showAddModal = false"
        />
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';
import { h, resolveComponent } from 'vue';

const NuxtLink = resolveComponent('NuxtLink');
const { t } = useI18n();

const { data: groups, refresh: refreshGroups } = useFetch('/api/groups', { default: () => [] });

type GroupRow = (typeof groups.value)[number];

const showAddModal = ref(false);
const creating = ref(false);

const columns: TableColumn<GroupRow>[] = [
  {
    accessorKey: 'name',
    header: t('group_name'),
    // The name link is stretched over the whole (relative) row, so clicking
    // anywhere opens the group while the row keeps plain link semantics.
    cell: ({ row, getValue }) => h(NuxtLink, {
      to: `/groups/${row.original.id}`,
      class: 'block max-w-md truncate hover:underline before:absolute before:inset-0',
      title: getValue<string>(),
    }, () => getValue<string>()),
  },
  {
    accessorKey: 'mediaCount',
    header: t('group_media_count'),
    cell: ({ getValue }) => t('group_media_count_value', getValue<number>()),
  },
];

async function handleCreateGroup(value: { name: string, mediaIds: string[] }) {
  creating.value = true;
  try {
    await $fetch('/api/groups', { method: 'POST', body: value });
    showAddModal.value = false;
    await refreshGroups();
  }
  finally {
    creating.value = false;
  }
}
</script>
