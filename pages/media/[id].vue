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
              :label="$t('create_new_tokens')"
              variant="outline"
              @click="showBatchModal = true"
            />
          </div>
        </div>
        <div v-if="batches && batches.length > 0">
          <UAccordion
            type="multiple"
            :items="batchAccordionItems"
          >
            <template #content="{ item }">
              <div class="space-y-3 pb-3">
                <div class="flex justify-end">
                  <UButton
                    :label="$t('qr_export')"
                    size="sm"
                    @click="openExportModal(item.value)"
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

    <UModal v-model:open="showExportModal" :title="$t('qr_export')">
      <template #body>
        <form class="space-y-4" @submit.prevent="handleExportDownload">
          <UFormField :label="$t('qr_export_format')">
            <URadioGroup
              v-model="exportForm.format"
              :items="exportFormatOptions"
              variant="list"
            />
          </UFormField>
          <UFormField
            v-if="exportForm.format === 'pdf-one' || exportForm.format === 'zip'"
            :label="$t('qr_export_size')"
            :hint="$t('qr_export_size_hint')"
          >
            <UInput
              v-model.number="exportForm.sizeCm"
              type="number"
              min="2"
              max="15"
              step="0.5"
            />
          </UFormField>
          <template v-if="exportForm.format === 'pdf-grid'">
            <UFormField :label="$t('qr_export_grid_cols')" :hint="$t('qr_export_grid_cols_hint')">
              <UInput
                v-model.number="exportForm.gridCols"
                type="number"
                min="1"
                max="6"
              />
            </UFormField>
            <UFormField :label="$t('qr_export_grid_rows')" :hint="$t('qr_export_grid_rows_hint')">
              <UInput
                v-model.number="exportForm.gridRows"
                type="number"
                min="1"
                max="10"
              />
            </UFormField>
          </template>
          <UCheckbox
            v-model="exportForm.showToken"
            :label="$t('qr_export_show_token')"
            :description="$t('qr_export_show_token_hint')"
          />
          <div class="flex justify-end gap-2">
            <UButton
              variant="outline"
              @click="showExportModal = false"
            >
              {{ $t('cancel') }}
            </UButton>
            <UButton type="submit">
              {{ $t('qr_export_download') }}
            </UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="showBatchModal">
      <template #content>
        <UCard>
          <template #header>
            {{ $t('create_new_tokens') }}
          </template>
          <form @submit.prevent="handleCreateBatch">
            <UFormField :label="$t('batch_name')">
              <UInput v-model="batchForm.name" :placeholder="$t('batch_name_placeholder')" required />
            </UFormField>
            <UFormField :label="$t('batch_count')">
              <UInput v-model.number="batchForm.count" type="number" min="1" max="500" :placeholder="$t('batch_count_placeholder')" />
            </UFormField>
            <UFormField :label="$t('token_usage_limit')">
              <UInput v-model.number="batchForm.usageLimit" type="number" min="1" />
            </UFormField>
            <UFormField :label="$t('token_expires_at')">
              <UInput v-model="batchForm.expiresAt" type="datetime-local" />
            </UFormField>
            <UButton type="submit" class="mt-4">
              {{ $t('create_new_tokens') }}
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

const route = useRoute();
const { t } = useI18n();

interface TokenRow { token: string, name: string, usageCount: number, usageLimit: number | null, expiresAt: string | null, batchId?: string }

const id = computed(() => route.params.id as string);
const { data: media } = useFetch(`/api/media/${id.value}`);
const { data: batches, refresh: refreshBatches } = useFetch(`/api/batches?mediaId=${id.value}`);
const showBatchModal = ref(false);
const showExportModal = ref(false);
const exportBatchId = ref<string | null>(null);
const batchForm = ref({ name: '', count: 50, usageLimit: null as number | null, expiresAt: '' });
const exportForm = ref({
  format: 'zip' as 'zip' | 'pdf-one' | 'pdf-grid',
  sizeCm: 5,
  gridCols: 3,
  gridRows: 4,
  showToken: false,
});

const exportFormatOptions = computed(() => [
  { label: t('qr_export_format_zip'), value: 'zip' },
  { label: t('qr_export_format_pdf_one'), value: 'pdf-one' },
  { label: t('qr_export_format_pdf_grid'), value: 'pdf-grid' },
]);

function openExportModal(batchId: string) {
  exportBatchId.value = batchId;
  exportForm.value = { format: 'zip', sizeCm: 5, gridCols: 3, gridRows: 4, showToken: false };
  showExportModal.value = true;
}

function handleExportDownload() {
  const batchId = exportBatchId.value;
  if (!batchId)
    return;
  const { format, sizeCm, gridCols, gridRows, showToken } = exportForm.value;
  let url: string;
  if (format === 'zip') {
    const size = Math.min(15, Math.max(2, sizeCm));
    url = `/api/batches/${batchId}/qr-zip?sizeCm=${size}&showToken=${showToken}`;
  }
  else if (format === 'pdf-grid') {
    const cols = Math.min(6, Math.max(1, Math.floor(gridCols)));
    const rows = Math.min(8, Math.max(1, Math.floor(gridRows)));
    url = `/api/batches/${batchId}/qr-pdf?layout=grid&cols=${cols}&rows=${rows}&showToken=${showToken}`;
  }
  else {
    const size = Math.min(15, Math.max(2, sizeCm));
    url = `/api/batches/${batchId}/qr-pdf?layout=one-per-page&sizeCm=${size}&showToken=${showToken}`;
  }
  window.open(url, '_blank');
  showExportModal.value = false;
}

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
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => {
      const token = row.original.token;
      return h('a', {
        href: `/${encodeURIComponent(token)}`,
        target: '_blank',
        rel: 'noopener noreferrer',
        class: 'inline-flex items-center gap-1 text-sm text-primary hover:underline',
      }, [h(resolveComponent('UIcon') as any, { name: 'i-heroicons-arrow-top-right-on-square', class: 'size-4' }), t('tokens_open_link')]);
    },
  },
];

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
  await $fetch('/api/batches', {
    method: 'POST',
    body,
  });
  showBatchModal.value = false;
  batchForm.value = { name: '', count: 50, usageLimit: null, expiresAt: '' };
  await refreshBatches();
}
</script>
