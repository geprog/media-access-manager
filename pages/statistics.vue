<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <div>
      <h1 class="text-2xl font-bold">
        {{ $t('statistics_title') }}
      </h1>
      <p class="mt-1 text-sm text-muted">
        {{ $t('statistics_intro') }}
      </p>
    </div>

    <!-- One filter row; everything below is counted against the same slice. -->
    <div class="flex flex-wrap items-end gap-4">
      <UFormField :label="$t('statistics_period')">
        <USelect
          v-model="period"
          class="w-48"
          :items="periodOptions"
        />
      </UFormField>
      <UFormField :label="$t('statistics_media_filter')">
        <USelectMenu
          v-model="mediaFilter"
          class="w-72"
          value-key="value"
          :items="mediaOptions"
          :search-input="{ placeholder: $t('media_video_search_placeholder') }"
        />
      </UFormField>
    </div>

    <div class="grid gap-4 sm:grid-cols-3 transition-opacity" :class="{ 'opacity-50': pending }">
      <UCard v-for="tile in tiles" :key="tile.label">
        <p class="text-sm text-muted">
          {{ tile.label }}
        </p>
        <p class="mt-1 text-3xl font-semibold">
          {{ tile.value }}
        </p>
      </UCard>
    </div>

    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">
          {{ $t(range.granularity === 'month' ? 'statistics_views_per_month' : 'statistics_views_per_day') }}
        </h2>
      </template>
      <ViewStatisticsChart
        :buckets="buckets"
        :granularity="range.granularity"
        :loading="pending"
      />
    </UCard>

    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">
          {{ $t('statistics_by_media') }}
        </h2>
      </template>
      <UTable
        :data="statistics?.media ?? []"
        :columns="mediaColumns"
        :loading="pending"
      >
        <template #empty>
          <p class="py-4 text-sm text-muted">
            {{ $t('statistics_empty') }}
          </p>
        </template>
      </UTable>
    </UCard>

    <UCard>
      <template #header>
        <div>
          <h2 class="text-lg font-semibold">
            {{ $t('statistics_recent_views') }}
          </h2>
          <p class="text-sm text-muted">
            {{ $t('statistics_recent_views_hint', { count: statistics?.recentLimit ?? 50 }) }}
          </p>
        </div>
      </template>
      <UTable
        :data="statistics?.recent ?? []"
        :columns="recentColumns"
        :loading="pending"
      >
        <template #empty>
          <p class="py-4 text-sm text-muted">
            {{ $t('statistics_empty') }}
          </p>
        </template>
      </UTable>
    </UCard>

    <TokenViewHistoryModal v-model:token-id="historyTokenId" />
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';
import type { StatisticsPeriod } from '~/utils/viewStatistics';
import { h, resolveComponent } from 'vue';
import { fillBuckets, getStatisticsRange, STATISTICS_PERIODS } from '~/utils/viewStatistics';

const NuxtLink = resolveComponent('NuxtLink');
const UButton = resolveComponent('UButton');
const { t, locale } = useI18n();
const route = useRoute();

const ALL_MEDIA = 'all';

const period = ref<StatisticsPeriod>('30d');
// A media page links here with its own id, so the page opens on that media.
const mediaFilter = ref(typeof route.query.mediaId === 'string' && route.query.mediaId ? route.query.mediaId : ALL_MEDIA);

const periodOptions = computed(() => STATISTICS_PERIODS.map(value => ({ label: t(`statistics_period_${value}`), value })));

const { data: media } = useFetch('/api/media', { default: () => [] });
const mediaOptions = computed(() => [
  { label: t('statistics_all_media'), value: ALL_MEDIA },
  ...media.value.map(item => ({ label: item.title, value: item.id })),
]);

const range = computed(() => getStatisticsRange(period.value));
// The server counts in whatever time zone the page names, so the days on the
// chart are the admin's days.
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const query = computed(() => ({
  from: range.value.from.toISOString(),
  to: range.value.to.toISOString(),
  granularity: range.value.granularity,
  timeZone,
  mediaId: mediaFilter.value === ALL_MEDIA ? undefined : mediaFilter.value,
}));

const { data: statistics, status } = useFetch('/api/statistics', { query });
const pending = computed(() => status.value === 'pending');

const buckets = computed(() => fillBuckets(range.value, statistics.value?.buckets ?? {}));

const tiles = computed(() => [
  { label: t('statistics_views'), value: statistics.value?.total ?? 0 },
  { label: t('statistics_tokens_used'), value: statistics.value?.tokens ?? 0 },
  { label: t('statistics_media_watched'), value: statistics.value?.media.length ?? 0 },
]);

type MediaRow = NonNullable<typeof statistics.value>['media'][number];
type RecentRow = NonNullable<typeof statistics.value>['recent'][number];

const historyTokenId = ref<string | null>(null);

function formatTime(value: string) {
  return new Date(value).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' });
}

const numberColumn = { class: { th: 'text-right', td: 'text-right tabular-nums' } };

const mediaColumns: TableColumn<MediaRow>[] = [
  {
    accessorKey: 'title',
    header: t('media_title'),
    cell: ({ row }) => h(NuxtLink, {
      to: `/media/${row.original.mediaId}`,
      class: 'hover:underline',
    }, () => row.original.title),
  },
  { accessorKey: 'views', header: t('statistics_views'), meta: numberColumn },
  { accessorKey: 'tokens', header: t('statistics_tokens'), meta: numberColumn },
  {
    accessorKey: 'lastViewedAt',
    header: t('statistics_last_view'),
    cell: ({ row }) => formatTime(row.original.lastViewedAt),
  },
];

/** Where the token is listed: its media page, or its group's page. */
function tokenHome(row: RecentRow) {
  return row.groupId ? `/groups/${row.groupId}` : `/media/${row.mediaId}`;
}

const recentColumns: TableColumn<RecentRow>[] = [
  {
    accessorKey: 'viewedAt',
    header: t('statistics_time'),
    cell: ({ row }) => formatTime(row.original.viewedAt),
  },
  {
    accessorKey: 'mediaTitle',
    header: t('media_title'),
    cell: ({ row }) => h(NuxtLink, {
      to: `/media/${row.original.mediaId}`,
      class: 'hover:underline',
    }, () => row.original.mediaTitle),
  },
  {
    id: 'token',
    header: t('tokens_token'),
    cell: ({ row }) => h('div', { class: 'flex flex-col' }, [
      h('span', row.original.tokenName),
      h('code', { class: 'text-xs text-muted' }, row.original.token),
    ]),
  },
  {
    id: 'batch',
    header: t('statistics_batch'),
    cell: ({ row }) => h('div', { class: 'flex flex-col' }, [
      h(NuxtLink, { to: tokenHome(row.original), class: 'hover:underline' }, () => row.original.batchName || '—'),
      ...(row.original.groupName
        ? [h('span', { class: 'text-xs text-muted' }, t('statistics_via_group', { name: row.original.groupName }))]
        : []),
    ]),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => h('div', { class: 'flex justify-end' }, [
      h(UButton as any, {
        label: t('token_history'),
        size: 'xs',
        variant: 'ghost',
        icon: 'i-heroicons-clock',
        onClick: () => {
          historyTokenId.value = row.original.tokenId;
        },
      }),
    ]),
  },
];
</script>
