<template>
  <UModal
    v-model:open="open"
    :title="history ? t('token_history_title', { name: history.token.name }) : t('token_history')"
    :description="t('token_history_hint')"
  >
    <template #body>
      <div v-if="history" class="space-y-4">
        <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div class="col-span-2 sm:col-span-3">
            <dt class="text-muted">
              {{ t('tokens_token') }}
            </dt>
            <dd><code class="text-sm">{{ history.token.token }}</code></dd>
          </div>
          <div v-if="history.targetTitle">
            <dt class="text-muted">
              {{ t('token_history_unlocks') }}
            </dt>
            <dd>{{ history.targetTitle }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              {{ t('token_history_created') }}
            </dt>
            <dd>{{ formatTime(history.token.createdAt) }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              {{ t('token_history_first_used') }}
            </dt>
            <dd>{{ history.token.firstUsedAt ? formatTime(history.token.firstUsedAt) : t('token_history_never_used') }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              {{ t('token_history_expires') }}
            </dt>
            <dd>{{ expiresText }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              {{ t('token_history_usage') }}
            </dt>
            <dd>{{ usageText }}</dd>
          </div>
        </dl>

        <!-- Views spent before the history existed are in the count but have no
             entry, which is exactly the gap an admin would otherwise puzzle over. -->
        <UAlert
          v-if="unrecordedViews > 0"
          color="neutral"
          variant="subtle"
          icon="i-heroicons-information-circle"
          :description="t('token_history_unrecorded', { count: unrecordedViews }, unrecordedViews)"
        />

        <div>
          <h3 class="mb-2 font-semibold">
            {{ t('token_history_views') }}
          </h3>
          <UTable
            :data="history.views"
            :columns="columns"
          >
            <template #empty>
              <p class="py-4 text-sm text-muted">
                {{ t('token_history_empty') }}
              </p>
            </template>
          </UTable>
        </div>
      </div>
      <p v-else-if="status === 'pending'" class="py-4 text-sm text-muted">
        {{ t('public_loading') }}
      </p>
      <p v-else-if="error" class="py-4 text-sm text-error">
        {{ t('error_occurred') }}
      </p>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';

/** The token whose history is shown; the dialog is open while it is set. */
const tokenId = defineModel<string | null>('tokenId', { required: true });

const { t } = useI18n();
const formatDuration = useDurationFormatter();

const { data: history, status, error, execute, clear } = useFetch(() => `/api/tokens/${tokenId.value}/views`, {
  immediate: false,
  watch: false,
});

type ViewEntry = NonNullable<typeof history.value>['views'][number];

watch(tokenId, (id) => {
  // What the last token showed must not flash up for the next one.
  clear();
  if (id) {
    void execute();
  }
}, { immediate: true });

const open = computed({
  get: () => tokenId.value !== null,
  set: (value) => {
    if (!value) {
      tokenId.value = null;
    }
  },
});

const formatTime = useDateTimeFormatter();

const expiresText = computed(() => {
  const token = history.value?.token;
  if (!token) {
    return '';
  }
  if (token.expiresAt) {
    return formatTime(token.expiresAt);
  }
  if (token.validFor) {
    return t('tokens_expires_after_first_use', { duration: formatDuration(token.validFor) });
  }
  return t('token_history_no_expiry');
});

/**
 * A group token's limit applies per media, so its total is shown with the
 * per-media limit beside it, the same way the token list does.
 */
const usageText = computed(() => {
  const token = history.value?.token;
  if (!token) {
    return '';
  }
  if (token.usageLimit == null) {
    return String(token.usageCount);
  }
  return token.groupId
    ? `${token.usageCount} (${t('tokens_usage_limit_per_media', { limit: token.usageLimit })})`
    : `${token.usageCount} / ${token.usageLimit}`;
});

const unrecordedViews = computed(() => {
  const current = history.value;
  return current ? Math.max(0, current.token.usageCount - current.views.length) : 0;
});

const columns = computed<TableColumn<ViewEntry>[]>(() => [
  {
    accessorKey: 'viewedAt',
    header: t('statistics_time'),
    cell: ({ row }) => formatTime(row.original.viewedAt),
  },
  // Which media a view opened only varies on a group token.
  ...(history.value?.token.groupId
    ? [{
      accessorKey: 'mediaTitle',
      header: t('media_title'),
    } satisfies TableColumn<ViewEntry>]
    : []),
]);
</script>
