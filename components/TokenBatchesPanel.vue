<template>
  <div>
    <div>
      <h2 class="mb-4 text-lg font-semibold">
        {{ $t('tokens_title') }}
      </h2>
      <div class="flex flex-wrap items-center gap-4 mb-4">
        <UButton
          :label="$t('create_new_tokens')"
          variant="outline"
          @click="openCreateModal"
        />
        <UInput
          v-if="hasBatches"
          v-model="tokenFilter"
          class="max-w-sm"
          icon="i-heroicons-magnifying-glass"
          :placeholder="$t('tokens_filter_placeholder')"
        />
      </div>
    </div>
    <div v-if="hasBatches">
      <UAccordion
        v-model="openBatchIds"
        type="multiple"
        :items="batchAccordionItems"
      >
        <template #content="{ item }">
          <div class="space-y-3 pb-3">
            <div class="flex justify-end gap-2">
              <UButton
                :label="$t('batch_edit')"
                size="sm"
                variant="outline"
                icon="i-heroicons-pencil-square"
                @click="openEditModal(item.value)"
              />
              <UButton
                :label="$t('qr_export')"
                size="sm"
                @click="openExportModal(item.value)"
              />
            </div>
            <BatchTokensTable
              :tokens="matchingTokensByBatch.get(item.value) ?? []"
              :columns="tokenColumns"
              :loading="tokensLoading"
            />
          </div>
        </template>
      </UAccordion>
      <p v-if="batchAccordionItems.length === 0" class="py-4 text-sm text-muted">
        {{ $t('tokens_filter_empty') }}
      </p>
    </div>

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
                max="8"
              />
            </UFormField>
            <UFormField :label="$t('qr_export_grid_margins')" :hint="$t('qr_export_grid_margins_hint')">
              <div class="grid grid-cols-2 gap-2">
                <UFormField
                  v-for="field in spacingFields.margins"
                  :key="field.key"
                  :label="$t(field.label)"
                  size="xs"
                >
                  <UInput
                    v-model.number="exportForm.spacing[field.key]"
                    type="number"
                    min="0"
                    :max="QR_GRID_SPACING_MAX_CM"
                    step="0.05"
                  />
                </UFormField>
              </div>
            </UFormField>
            <UFormField :label="$t('qr_export_grid_gaps')" :hint="$t('qr_export_grid_gaps_hint')">
              <div class="grid grid-cols-2 gap-2">
                <UFormField
                  v-for="field in spacingFields.gaps"
                  :key="field.key"
                  :label="$t(field.label)"
                  size="xs"
                >
                  <UInput
                    v-model.number="exportForm.spacing[field.key]"
                    type="number"
                    min="0"
                    :max="QR_GRID_SPACING_MAX_CM"
                    step="0.05"
                  />
                </UFormField>
              </div>
            </UFormField>
            <p v-if="gridCellSize" class="text-sm text-muted">
              {{ $t('qr_export_grid_cell_size', gridCellSize) }}
            </p>
            <UAlert
              v-else
              color="error"
              variant="subtle"
              :description="$t('qr_export_grid_no_room')"
            />
          </template>
          <UCheckbox
            v-model="exportForm.showToken"
            :label="$t('qr_export_show_token')"
            :description="$t('qr_export_show_token_hint')"
          />
          <template v-if="exportForm.format !== 'zip'">
            <UCheckbox
              v-model="exportForm.showLabel"
              :label="$t('qr_export_show_label')"
              :description="$t('qr_export_show_label_hint')"
            />
            <template v-if="exportForm.showLabel">
              <UFormField :label="$t('qr_export_label')">
                <UInput
                  v-model="exportForm.label"
                  class="w-full"
                  maxlength="200"
                />
              </UFormField>
              <UFormField :label="$t('qr_export_label_position')">
                <URadioGroup
                  v-model="exportForm.labelPosition"
                  :items="labelPositionOptions"
                  orientation="horizontal"
                />
              </UFormField>
            </template>
          </template>
          <div class="flex justify-end gap-2">
            <UButton
              variant="outline"
              @click="showExportModal = false"
            >
              {{ $t('cancel') }}
            </UButton>
            <UButton type="submit" :disabled="exportForm.format === 'pdf-grid' && !gridCellSize">
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
            {{ editingBatchId ? $t('batch_edit') : $t('create_new_tokens') }}
          </template>
          <form @submit.prevent="handleSubmitBatch">
            <p v-if="editingBatchId" class="mb-4 text-sm text-muted">
              {{ $t('batch_edit_hint') }}
            </p>
            <UFormField :label="$t('batch_name')">
              <UInput v-model="batchForm.name" :placeholder="$t('batch_name_placeholder')" required />
            </UFormField>
            <UFormField v-if="!editingBatchId" :label="$t('batch_count')">
              <UInput v-model.number="batchForm.count" type="number" min="1" max="500" :placeholder="$t('batch_count_placeholder')" />
            </UFormField>
            <UFormField
              :label="$t('token_usage_limit')"
              :hint="groupId ? $t('token_usage_limit_per_media_hint') : undefined"
            >
              <UInput v-model.number="batchForm.usageLimit" type="number" min="1" />
            </UFormField>
            <UFormField :label="$t('token_validity_start')">
              <URadioGroup
                v-model="batchForm.validityStart"
                :items="validityStartOptions"
              />
            </UFormField>
            <UFormField v-if="batchForm.validityStart === 'immediately'" :label="$t('token_expires_at')">
              <UInput v-model="batchForm.expiresAt" type="datetime-local" />
            </UFormField>
            <UFormField
              v-else
              :label="$t('token_valid_for')"
              :hint="$t('token_valid_for_hint')"
              :help="editingBatchId ? $t('batch_edit_first_use_hint') : undefined"
            >
              <div class="flex gap-2">
                <UInput
                  v-model.number="batchForm.validForValue"
                  type="number"
                  min="1"
                  step="1"
                  required
                  class="w-28"
                />
                <USelect
                  v-model="batchForm.validForUnit"
                  :items="validForUnitOptions"
                  class="w-36"
                />
              </div>
            </UFormField>
            <UButton type="submit" class="mt-4">
              {{ editingBatchId ? $t('batch_save') : $t('create_new_tokens') }}
            </UButton>
          </form>
        </UCard>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';
import type { ValidityDuration, ValidityUnit } from '~/utils/accessWindow';
import type { LabelPosition, QRGridSpacing } from '~/utils/qrGrid';
import type { TokenRow } from '~/utils/tokens';
import { format } from 'date-fns';
import { h, resolveComponent } from 'vue';
import { computeQRGridCells, DEFAULT_QR_GRID_SPACING, LABEL_POSITIONS, parseQRGridSpacing, QR_GRID_SPACING_MAX_CM } from '~/utils/qrGrid';
import { getBatchSettings, groupMatchingTokensByBatch } from '~/utils/tokens';

const props = defineProps<{
  /** Set for a single media's tokens; mutually exclusive with `groupId`. */
  mediaId?: string
  /** Set for a group's tokens, whose limits are spent per media of the group. */
  groupId?: string
  /** What the QR export prints next to each code unless the admin changes it. */
  defaultLabel?: string
}>();

const { t } = useI18n();

const targetQuery = computed(() =>
  props.groupId ? `groupId=${props.groupId}` : `mediaId=${props.mediaId}`,
);

const { data: batches, refresh: refreshBatches } = useFetch(() => `/api/batches?${targetQuery.value}`);
// Every token of this target at once, so one search box can reach across all
// batches instead of each batch searching only its own rows.
const { data: tokens, status: tokensStatus, refresh: refreshTokens } = useFetch(() => `/api/tokens?${targetQuery.value}`);

const showBatchModal = ref(false);
const showExportModal = ref(false);
const exportBatchId = ref<string | null>(null);
function emptyBatchForm() {
  return {
    name: '',
    count: 50,
    usageLimit: null as number | null,
    /** Whether the tokens count down from now or from each one's first use. */
    validityStart: 'immediately' as 'immediately' | 'first_use',
    expiresAt: '',
    validForValue: 7,
    validForUnit: 'days' as ValidityUnit,
  };
}

type BatchForm = ReturnType<typeof emptyBatchForm>;

const batchForm = ref(emptyBatchForm());
/** The batch the dialog edits, `null` while it creates a new one. */
const editingBatchId = ref<string | null>(null);
/** The form as it was opened for editing, so only what the admin changed is sent. */
let initialEditForm: BatchForm | null = null;

function openCreateModal() {
  editingBatchId.value = null;
  batchForm.value = emptyBatchForm();
  showBatchModal.value = true;
}

function openEditModal(batchId: string) {
  const batch = batches.value?.find(b => b.id === batchId);
  if (!batch)
    return;
  const settings = getBatchSettings((tokens.value ?? []).filter(row => row.batchId === batchId));
  const form: BatchForm = {
    ...emptyBatchForm(),
    name: batch.name,
    usageLimit: settings.usageLimit,
    validityStart: settings.validFor ? 'first_use' : 'immediately',
    // The date input works in the admin's local time, without seconds.
    expiresAt: settings.expiresAt ? format(new Date(settings.expiresAt), 'yyyy-MM-dd\'T\'HH:mm') : '',
  };
  const [unit, value] = Object.entries(settings.validFor ?? {})[0] ?? [];
  if (unit && value) {
    form.validForUnit = unit as ValidityUnit;
    form.validForValue = value;
  }
  initialEditForm = structuredClone(form);
  batchForm.value = form;
  editingBatchId.value = batchId;
  showBatchModal.value = true;
}

/**
 * The validity part of the form as the API takes it, or `null` while the
 * first-use duration is not a positive whole number. The date is sent as an
 * instant so the server does not read it in its own time zone.
 */
function validityBody(form: BatchForm): { validFor: ValidityDuration } | { expiresAt: string | null } | null {
  if (form.validityStart === 'first_use') {
    if (!Number.isInteger(form.validForValue) || form.validForValue < 1)
      return null;
    return { validFor: { [form.validForUnit]: form.validForValue } };
  }
  return { expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null };
}

/** An emptied number input holds `''` rather than `null`. */
function usageLimitOf(form: BatchForm): number | null {
  return form.usageLimit || null;
}

const validityStartOptions = computed(() => [
  { label: t('token_validity_start_immediately'), value: 'immediately' },
  { label: t('token_validity_start_first_use'), value: 'first_use' },
]);

const validForUnitOptions = computed(() => [
  { label: t('duration_unit_hours'), value: 'hours' },
  { label: t('duration_unit_days'), value: 'days' },
  { label: t('duration_unit_weeks'), value: 'weeks' },
  { label: t('duration_unit_months'), value: 'months' },
]);

const formatDuration = useDurationFormatter();
function emptyExportForm() {
  return {
    format: 'zip' as 'zip' | 'pdf-one' | 'pdf-grid',
    sizeCm: 5,
    gridCols: 3,
    gridRows: 4,
    spacing: { ...DEFAULT_QR_GRID_SPACING },
    showToken: false,
    showLabel: false,
    label: props.defaultLabel ?? '',
    labelPosition: 'right' as LabelPosition,
  };
}

const exportForm = ref(emptyExportForm());

const spacingFields: Record<'margins' | 'gaps', { key: keyof QRGridSpacing, label: string }[]> = {
  margins: [
    { key: 'marginTop', label: 'qr_export_grid_margin_top' },
    { key: 'marginBottom', label: 'qr_export_grid_margin_bottom' },
    { key: 'marginLeft', label: 'qr_export_grid_margin_left' },
    { key: 'marginRight', label: 'qr_export_grid_margin_right' },
  ],
  gaps: [
    { key: 'gapX', label: 'qr_export_grid_gap_x' },
    { key: 'gapY', label: 'qr_export_grid_gap_y' },
  ],
};

function gridCols() {
  return Math.min(6, Math.max(1, Math.floor(exportForm.value.gridCols || 1)));
}

function gridRows() {
  return Math.min(8, Math.max(1, Math.floor(exportForm.value.gridRows || 1)));
}

/** The label size the spacing leaves, so it can be checked against the sticker sheet. */
const gridCellSize = computed(() => {
  const cells = computeQRGridCells(gridCols(), gridRows(), parseQRGridSpacing(exportForm.value.spacing));
  const cell = cells?.[0];
  if (!cell)
    return null;
  const format = (cm: number) => (Math.round(cm * 100) / 100).toLocaleString();
  return { width: format(cell.width), height: format(cell.height) };
});

const labelPositionOptions = computed(() => LABEL_POSITIONS.map(position => ({
  label: t(`qr_export_label_position_${position}`),
  value: position,
})));

const exportFormatOptions = computed(() => [
  { label: t('qr_export_format_zip'), value: 'zip' },
  { label: t('qr_export_format_pdf_one'), value: 'pdf-one' },
  { label: t('qr_export_format_pdf_grid'), value: 'pdf-grid' },
]);

function openExportModal(batchId: string) {
  exportBatchId.value = batchId;
  exportForm.value = emptyExportForm();
  showExportModal.value = true;
}

function handleExportDownload() {
  const batchId = exportBatchId.value;
  if (!batchId)
    return;
  const { format, sizeCm, showToken, showLabel, labelPosition } = exportForm.value;
  const label = showLabel ? exportForm.value.label.trim() : '';
  let url: string;
  if (format === 'zip') {
    const size = Math.min(15, Math.max(2, sizeCm));
    url = `/api/batches/${batchId}/qr-zip?sizeCm=${size}&showToken=${showToken}`;
  }
  else if (format === 'pdf-grid') {
    const params = new URLSearchParams({
      layout: 'grid',
      cols: String(gridCols()),
      rows: String(gridRows()),
      showToken: String(showToken),
    });
    if (label) {
      params.set('label', label);
      params.set('labelPosition', labelPosition);
    }
    for (const [key, value] of Object.entries(parseQRGridSpacing(exportForm.value.spacing)))
      params.set(key, String(value));
    url = `/api/batches/${batchId}/qr-pdf?${params}`;
  }
  else {
    const size = Math.min(15, Math.max(2, sizeCm));
    const params = new URLSearchParams({
      layout: 'one-per-page',
      sizeCm: String(size),
      showToken: String(showToken),
    });
    if (label) {
      params.set('label', label);
      params.set('labelPosition', labelPosition);
    }
    url = `/api/batches/${batchId}/qr-pdf?${params}`;
  }
  window.open(url, '_blank');
  showExportModal.value = false;
}

const hasBatches = computed(() => (batches.value?.length ?? 0) > 0);
const tokensLoading = computed(() => tokensStatus.value === 'pending');

const tokenFilter = ref('');
const isSearching = computed(() => tokenFilter.value.trim().length > 0);

const matchingTokensByBatch = computed(() =>
  groupMatchingTokensByBatch(tokens.value ?? [], tokenFilter.value),
);

const batchAccordionItems = computed(() =>
  (batches.value ?? [])
    // A batch without a single hit would only be an empty drawer to open.
    .filter(b => !isSearching.value || matchingTokensByBatch.value.has(b.id))
    .map(b => ({
      label: isSearching.value
        ? `${b.name || b.id} (${matchingTokensByBatch.value.get(b.id)?.length ?? 0} / ${b.count} ${t('batches_tokens_count')})`
        : `${b.name || b.id} (${b.count} ${t('batches_tokens_count')})`,
      value: b.id,
    })),
);

const openBatchIds = ref<string[]>([]);

// Searching means the admin wants to see the hits, not hunt for the batch
// holding them, so every batch with a match opens itself.
watch(tokenFilter, () => {
  openBatchIds.value = isSearching.value ? [...matchingTokensByBatch.value.keys()] : [];
});

function formatDate(ts: string | number | Date) {
  return new Date(ts).toLocaleDateString();
}

/**
 * A group token spends its limit on every media separately, so its counter is
 * a total across media and cannot be read against the limit. Naming the limit
 * beside the total keeps both honest.
 */
function usageText(row: TokenRow): string {
  if (!props.groupId) {
    return `${row.usageCount}${row.usageLimit != null ? ` / ${row.usageLimit}` : ''}`;
  }
  return row.usageLimit != null
    ? `${row.usageCount} (${t('tokens_usage_limit_per_media', { limit: row.usageLimit })})`
    : String(row.usageCount);
}

/**
 * A token whose validity starts on first use has no date to show until then,
 * only the duration it will run for once opened.
 */
function expiresText(row: TokenRow): string {
  if (row.expiresAt) {
    return formatDate(row.expiresAt);
  }
  if (row.validFor) {
    return t('tokens_expires_after_first_use', { duration: formatDuration(row.validFor) });
  }
  return '—';
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
    cell: ({ row }) => usageText(row.original),
  },
  {
    id: 'expires',
    header: t('tokens_expires'),
    cell: ({ row }) => expiresText(row.original),
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

function handleSubmitBatch() {
  return editingBatchId.value ? handleUpdateBatch(editingBatchId.value) : handleCreateBatch();
}

async function handleCreateBatch() {
  const form = batchForm.value;
  const validity = validityBody(form);
  if (!form.name.trim() || !validity)
    return;
  const body: Record<string, unknown> = {
    ...(props.groupId ? { groupId: props.groupId } : { mediaId: props.mediaId }),
    name: form.name.trim(),
    count: form.count,
    ...validity,
  };
  const usageLimit = usageLimitOf(form);
  if (usageLimit)
    body.usageLimit = usageLimit;
  await $fetch('/api/batches', {
    method: 'POST',
    body,
  });
  showBatchModal.value = false;
  batchForm.value = emptyBatchForm();
  await Promise.all([refreshBatches(), refreshTokens()]);
}

/**
 * Sends only what differs from the opened form: re-sending an untouched
 * validity would needlessly rewrite the expiry of every token of the batch.
 */
async function handleUpdateBatch(batchId: string) {
  const form = batchForm.value;
  const initial = initialEditForm;
  const validity = validityBody(form);
  if (!form.name.trim() || !validity || !initial)
    return;
  const body: Record<string, unknown> = {};
  if (form.name.trim() !== initial.name)
    body.name = form.name.trim();
  if (usageLimitOf(form) !== usageLimitOf(initial))
    body.usageLimit = usageLimitOf(form);
  if (JSON.stringify(validity) !== JSON.stringify(validityBody(initial)))
    Object.assign(body, validity);
  if (Object.keys(body).length > 0) {
    await $fetch(`/api/batches/${batchId}`, {
      method: 'PATCH',
      body,
    });
  }
  showBatchModal.value = false;
  editingBatchId.value = null;
  await Promise.all([refreshBatches(), refreshTokens()]);
}
</script>
