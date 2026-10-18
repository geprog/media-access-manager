<template>
  <div class="space-y-3">
    <div class="flex items-center justify-end">
      <UButton
        variant="link"
        size="xs"
        class="p-0"
        :icon="showTable ? 'i-heroicons-chart-bar' : 'i-heroicons-table-cells'"
        :label="showTable ? t('statistics_show_chart') : t('statistics_show_table')"
        @click="showTable = !showTable"
      />
    </div>

    <UTable
      v-if="showTable"
      :data="buckets"
      :columns="tableColumns"
    />

    <div
      v-else
      role="img"
      :aria-label="summary"
      class="transition-opacity"
      :class="{ 'opacity-50': loading }"
    >
      <p v-if="total === 0" class="py-8 text-center text-sm text-muted">
        {{ t('statistics_empty') }}
      </p>
      <div v-else class="flex gap-3">
        <!-- The ticks carry the values the bars are not labeled with. -->
        <div class="relative w-8 shrink-0 text-xs text-muted tabular-nums" :style="{ height: `${PLOT_HEIGHT}px` }">
          <span
            v-for="tick in ticks"
            :key="tick"
            class="absolute right-0 -translate-y-1/2"
            :style="{ top: `${(1 - tick / scaleMax) * 100}%` }"
          >{{ tick }}</span>
        </div>
        <div class="min-w-0 flex-1">
          <div class="relative" :style="{ height: `${PLOT_HEIGHT}px` }">
            <!-- Hairline grid lines one step off the surface, behind the bars. -->
            <div
              v-for="tick in ticks"
              :key="tick"
              class="absolute inset-x-0 border-t border-default"
              :style="{ top: `${(1 - tick / scaleMax) * 100}%` }"
            />
            <!-- A 2px gap of surface between neighbors keeps the bars apart
                 without drawing a border around them. -->
            <div class="absolute inset-0 flex items-end gap-[2px]">
              <UTooltip
                v-for="bucket in buckets"
                :key="bucket.key"
                :text="`${t('statistics_chart_tooltip', { count: bucket.views }, bucket.views)} · ${label(bucket, 'long')}`"
                :delay-duration="0"
              >
                <!-- The whole column is the hit target, not just the painted bar. -->
                <div class="group flex h-full min-w-0 flex-1 items-end justify-center">
                  <div
                    class="w-full max-w-6 rounded-t bg-primary transition-opacity group-hover:opacity-70"
                    :style="{ height: `${Math.max(bucket.views > 0 ? MIN_BAR_HEIGHT : 0, (bucket.views / scaleMax) * PLOT_HEIGHT)}px` }"
                  />
                </div>
              </UTooltip>
            </div>
          </div>
          <div class="mt-1 flex gap-[2px] text-xs text-muted">
            <div
              v-for="(bucket, index) in buckets"
              :key="bucket.key"
              class="min-w-0 flex-1"
            >
              <span v-if="index % labelStep === 0" class="block whitespace-nowrap">
                {{ label(bucket, 'short') }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui';
import type { BucketGranularity, ViewBucket } from '~/utils/viewStatistics';

const props = defineProps<{
  /** Every bucket of the period in order, quiet ones included. */
  buckets: ViewBucket[]
  granularity: BucketGranularity
  /** Holds the last render at reduced opacity while new numbers load. */
  loading?: boolean
}>();

const { t, locale } = useI18n();

const PLOT_HEIGHT = 192;
/** A day with a single view still shows as a sliver rather than nothing. */
const MIN_BAR_HEIGHT = 3;
/** At most this many bars are labeled below, so labels never collide. */
const MAX_AXIS_LABELS = 12;

const showTable = ref(false);

const total = computed(() => props.buckets.reduce((sum, bucket) => sum + bucket.views, 0));

/** The top of the scale, rounded up to a round number so the ticks read cleanly. */
const scaleMax = computed(() => {
  const max = Math.max(0, ...props.buckets.map(bucket => bucket.views));
  if (max <= 1) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 2.5, 5, 10].map(step => step * magnitude).find(candidate => candidate >= max) ?? max;
});

/** Baseline, middle and top — the middle only when it is a whole number. */
const ticks = computed(() => {
  const half = scaleMax.value / 2;
  return Number.isInteger(half) ? [0, half, scaleMax.value] : [0, scaleMax.value];
});

const labelStep = computed(() => Math.max(1, Math.ceil(props.buckets.length / MAX_AXIS_LABELS)));

function label(bucket: ViewBucket, style: 'short' | 'long'): string {
  if (props.granularity === 'month') {
    return bucket.start.toLocaleDateString(locale.value, style === 'long'
      ? { month: 'long', year: 'numeric' }
      : { month: 'short', year: '2-digit' });
  }
  return bucket.start.toLocaleDateString(locale.value, style === 'long'
    ? { dateStyle: 'full' }
    : { day: 'numeric', month: 'short' });
}

const summary = computed(() => {
  const first = props.buckets[0];
  const last = props.buckets.at(-1);
  if (!first || !last) {
    return t('statistics_empty');
  }
  return t('statistics_chart_summary', {
    total: total.value,
    from: label(first, 'long'),
    to: label(last, 'long'),
  });
});

const tableColumns = computed<TableColumn<ViewBucket>[]>(() => [
  {
    id: 'bucket',
    header: t(props.granularity === 'month' ? 'statistics_month' : 'statistics_day'),
    cell: ({ row }) => label(row.original, 'long'),
  },
  {
    accessorKey: 'views',
    header: t('statistics_views'),
    meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } },
  },
]);
</script>
