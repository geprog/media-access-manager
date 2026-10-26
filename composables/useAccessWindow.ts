import type { MaybeRefOrGetter } from 'vue';
import type { ValidityDuration } from '~/utils/accessWindow';
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

/** Words a duration such as a token's `validFor` ("2 months"). */
export function useDurationFormatter() {
  const { locale } = useI18n();

  return (duration: ValidityDuration) =>
    new Intl.DurationFormat(locale.value, { style: 'long' }).format(duration);
}

/** Words a moment the way the admin pages show times ("Oct 18, 2026, 11:38 PM"). */
export function useDateTimeFormatter() {
  const { locale } = useI18n();

  return (value: string | number | Date) =>
    new Date(value).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * How long the visitor's access still lasts, worded for a badge. `null` when
 * there is nothing worth saying — a link with no expiry date but a view limit
 * does run out, just by views rather than by time, so promising it never
 * expires would contradict the count beside it.
 *
 * A link whose validity starts on first use has no expiry date until then, so
 * it is described by the duration it will run for instead.
 */
export function useExpiryLabel(
  expiresAt: MaybeRefOrGetter<Date | null>,
  hasUsageLimit: MaybeRefOrGetter<boolean>,
  validFor: MaybeRefOrGetter<ValidityDuration | null> = null,
) {
  const { t, locale } = useI18n();
  const now = useNow();
  const formatDuration = useDurationFormatter();

  return computed(() => {
    const expiry = toValue(expiresAt);
    if (!expiry) {
      const duration = toValue(validFor);
      if (duration) {
        return t('public_access_starts_on_first_use', { duration: formatDuration(duration) });
      }
      return toValue(hasUsageLimit) ? null : t('public_access_no_expiry');
    }
    const remaining = getRemainingTime(expiry, now.value);
    if (!remaining) {
      return t('public_access_expired');
    }
    return t('public_access_expires', {
      date: expiry.toLocaleString(locale.value, { dateStyle: 'long', timeStyle: 'short' }),
      duration: new Intl.DurationFormat(locale.value, { style: 'long' }).format(remaining),
    });
  });
}
