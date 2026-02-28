<template>
  <div class="mx-auto max-w-6xl">
    <UButton
      variant="ghost"
      class="mb-4"
      to="/"
    >
      ← {{ $t('media_list_title') }}
    </UButton>
    <UCard v-if="media">
      <template #header>
        <h1 class="text-2xl font-bold">
          {{ media.title ?? '...' }}
        </h1>
      </template>
      <div class="space-y-6">
        <div>
          <h2 class="mb-4 text-lg font-semibold">
            {{ $t('tokens_title') }}
          </h2>
          <div class="flex gap-4 mb-4">
            <UButton
              :label="$t('tokens_create')"
              @click="showCreateModal = true"
            />
            <UButton
              :label="$t('tokens_create_batch')"
              variant="outline"
              @click="showBatchModal = true"
            />
          </div>
          <BatchTokensTable
            :media-id="id"
            :columns="tokenColumns"
          />
        </div>
        <div v-if="batches && batches.length > 0">
          <h2 class="mb-4 text-lg font-semibold">
            {{ $t('batches_title') }}
          </h2>
          <UAccordion
            type="multiple"
            :items="batchAccordionItems"
          >
            <template #content="{ item }">
              <div class="space-y-3 pb-3">
                <div class="flex justify-end">
                  <UButton
                    :label="$t('tokens_download_qr_zip')"
                    size="sm"
                    :href="`/api/tokens/batch/${item.value}/qr-zip`"
                    target="_blank"
                  />
                </div>
                <BatchTokensTable
                  :batch-id="item.value"
                  :columns="tokenColumns"
                />
              </div>
            </template>
          </UAccordion>
        </div>
      </div>
    </UCard>

    <UModal v-model:open="showCreateModal">
      <template #content>
        <UCard>
          <template #header>
            {{ $t('tokens_create') }}
          </template>
          <form @submit.prevent="handleCreateToken">
            <UFormField :label="$t('token_name')">
              <UInput v-model="tokenForm.name" :placeholder="$t('token_name_placeholder')" required />
            </UFormField>
            <UButton type="submit" class="mt-4">
              {{ $t('tokens_create') }}
            </UButton>
          </form>
        </UCard>
      </template>
    </UModal>

    <UModal v-model:open="showBatchModal">
      <template #content>
        <UCard>
          <template #header>
            {{ $t('tokens_create_batch') }}
          </template>
          <form @submit.prevent="handleCreateBatch">
            <UFormField :label="$t('batch_name')">
              <UInput v-model="batchForm.name" :placeholder="$t('batch_name_placeholder')" required />
            </UFormField>
            <UFormField :label="$t('batch_count')">
              <UInput v-model.number="batchForm.count" type="number" min="1" max="500" :placeholder="$t('batch_count_placeholder')" />
            </UFormField>
            <UFormField :label="$t('batch_usage_limit')">
              <UInput v-model.number="batchForm.usageLimit" type="number" min="1" />
            </UFormField>
            <UFormField :label="$t('batch_expires_at')">
              <UInput v-model="batchForm.expiresAt" type="datetime-local" />
            </UFormField>
            <UButton type="submit" class="mt-4">
              {{ $t('tokens_create_batch') }}
            </UButton>
          </form>
        </UCard>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';
import { h } from 'vue';

const route = useRoute();
const { t } = useI18n();

interface TokenRow { token: string, name: string, usageCount: number, usageLimit: number | null, expiresAt: string | null, batchId?: string }

const id = computed(() => route.params.id as string);
const { data: media } = useFetch(`/api/media/${id.value}`);
const { data: batches } = useFetch(`/api/batches?mediaId=${id.value}`);
const showCreateModal = ref(false);
const showBatchModal = ref(false);
const tokenForm = ref({ name: '' });
const batchForm = ref({ name: '', count: 50, usageLimit: null as number | null, expiresAt: '' });

const batchAccordionItems = computed(() =>
  batches.value?.map(b => ({
    label: `${b.name || b.id} (${b.count} ${t('batches_tokens_count')})`,
    value: b.id,
  })),
);

function formatDate(ts: string | number | Date) {
  return new Date(ts).toLocaleDateString();
}

const tokenColumns: TableColumn<TokenRow>[] = [
  {
    accessorKey: 'name',
    header: t('tokens_name'),
    cell: ({ row }) => row.getValue('name') || '—',
  },
  {
    accessorKey: 'token',
    header: t('tokens_token'),
    cell: ({ row }) => h('code', { class: 'text-sm' }, row.getValue('token')),
  },
  {
    id: 'usage',
    header: t('tokens_usage'),
    cell: ({ row }) => {
      const r = row.original;
      return `${r.usageCount}${r.usageLimit != null ? ` / ${r.usageLimit}` : ''}`;
    },
  },
  {
    id: 'expires',
    header: t('tokens_expires'),
    cell: ({ row }) => row.original.expiresAt ? formatDate(row.original.expiresAt) : '—',
  },
];

async function handleCreateToken() {
  if (!tokenForm.value.name.trim())
    return;
  await $fetch('/api/tokens', {
    method: 'POST',
    body: { mediaId: id.value, name: tokenForm.value.name.trim() },
  });
  showCreateModal.value = false;
  tokenForm.value.name = '';
}

async function handleCreateBatch() {
  if (!batchForm.value.name.trim())
    return;
  const body: Record<string, unknown> = {
    mediaId: id.value,
    name: batchForm.value.name.trim(),
    count: batchForm.value.count,
  };
  if (batchForm.value.usageLimit)
    body.usageLimit = batchForm.value.usageLimit;
  if (batchForm.value.expiresAt)
    body.expiresAt = batchForm.value.expiresAt;
  await $fetch('/api/tokens/batch', {
    method: 'POST',
    body,
  });
  showBatchModal.value = false;
  batchForm.value = { name: '', count: 50, usageLimit: null, expiresAt: '' };
}
</script>
