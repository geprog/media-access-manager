import type { MaybeRefOrGetter } from 'vue';
import { getRemainingTime } from '~/utils/accessWindow';

/**
 * Someone may leave the page open far longer than their access lasts, so the
 * remaining time is recomputed instead of frozen at load. Half a minute keeps
 * the wording honest without re-rendering for a display counted in days.
 */
const REMAINING_TIME_REFRESH_MS = 30 * 1000;

export function useNow(intervalMs = REMAINING_TIME_REFRESH_MS) {
  const now = ref(new Date());
  let ticker: ReturnType<typeof setInterval> | undefined;

  onMounted(() => {
    ticker = setInterval(() => {
      now.value = new Date();
    }, intervalMs);
  });

  onBeforeUnmount(() => clearInterval(ticker));

  return now;
}

/**
 * How long the visitor's access still lasts, worded for a badge. `null` when
 * there is nothing worth saying — a link with no expiry date but a view limit
 * does run out, just by views rather than by time, so promising it never
 * expires would contradict the count beside it.
 */
export function useExpiryLabel(
  expiresAt: MaybeRefOrGetter<Date | null>,
  hasUsageLimit: MaybeRefOrGetter<boolean>,
) {
  const { t, locale } = useI18n();
  const now = useNow();

  return computed(() => {
    const expiry = toValue(expiresAt);
    if (!expiry) {
      return toValue(hasUsageLimit) ? null : t('public_access_no_expiry');
    }
    const remaining = getRemainingTime(expiry, now.value);
    if (!remaining) {
      return t('public_access_expired');
    }
    return t('public_access_expires', {
      date: expiry.toLocaleString(locale.value, { dateStyle: 'long', timeStyle: 'short' }),
      duration: new Intl.NumberFormat(locale.value, {
        style: 'unit',
        unit: remaining.unit,
        unitDisplay: 'long',
      }).format(remaining.value),
    });
  });
}
