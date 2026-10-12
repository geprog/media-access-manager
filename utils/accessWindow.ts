import { add, intervalToDuration } from 'date-fns';

/**
 * How much of a token's access window is left, in the shape
 * `Intl.DurationFormat` takes. The platform already knows how to word
 * "1 hour, 59 minutes" in every locale the app ships, so only picking the
 * units is ours. Units with nothing left in them are left out.
 */
export type RemainingTime = Partial<Record<RemainingTimeUnit, number>>;

type RemainingTimeUnit = 'years' | 'months' | 'days' | 'hours' | 'minutes' | 'seconds';

/** Largest first; each unit is followed by the one shown beside it. */
const REMAINING_TIME_UNITS: RemainingTimeUnit[] = ['years', 'months', 'days', 'hours', 'minutes', 'seconds'];

/**
 * The largest whole unit still left before `expiresAt` together with the next
 * smaller one ("1 hour, 59 minutes", "2 months, 5 days"), or `null` once the
 * window has closed. Below an hour minutes stand alone: the page only
 * refreshes every half minute, so a seconds count would always be stale.
 *
 * Months and years follow the calendar — from 10 February to 10 April is two
 * months, however many days lie between. Always rounds down, so the visitor is
 * never promised time they do not have.
 */
export function getRemainingTime(expiresAt: Date, now: Date = new Date()): RemainingTime | null {
  if (expiresAt.getTime() <= now.getTime()) {
    return null;
  }
  const remaining = intervalToDuration({ start: now, end: expiresAt });
  const index = REMAINING_TIME_UNITS.findIndex(unit => remaining[unit]);
  // Under a second is still time left, counted as zero seconds.
  if (index === -1) {
    return { seconds: 0 };
  }
  const unit = REMAINING_TIME_UNITS[index]!;
  const result: RemainingTime = { [unit]: remaining[unit] };
  const next = REMAINING_TIME_UNITS[index + 1];
  if (next && unit !== 'minutes' && remaining[next]) {
    result[next] = remaining[next];
  }
  return result;
}

/**
 * Views left on a usage-limited token, or `null` when it has no limit. The
 * current view is already counted in `usageCount`, so this is what remains
 * after the page the visitor is looking at.
 */
export function getRemainingViews(usageLimit: number | null, usageCount: number): number | null {
  if (usageLimit == null) {
    return null;
  }
  return Math.max(0, usageLimit - usageCount);
}

/** The units an admin can pick for how long a token lasts after its first use. */
export const VALIDITY_UNITS = ['hours', 'days', 'weeks', 'months'] as const;

export type ValidityUnit = typeof VALIDITY_UNITS[number];

/**
 * How long a token lasts from its first use, kept in the unit the admin chose
 * (`{ months: 2 }`) rather than as a fixed length: a month only becomes a
 * number of days once it is known which month it starts in.
 */
export type ValidityDuration = Partial<Record<ValidityUnit, number>>;

/** A validity duration from untrusted input, or `null` unless it is exactly one known unit with a positive whole count. */
export function parseValidityDuration(input: unknown): ValidityDuration | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }
  const entries = Object.entries(input);
  if (entries.length !== 1) {
    return null;
  }
  const [unit, value] = entries[0]!;
  if (!(VALIDITY_UNITS as readonly string[]).includes(unit) || !Number.isInteger(value) || (value as number) < 1) {
    return null;
  }
  return { [unit]: value };
}

/**
 * When a validity starting at `start` ends. Months are calendar months, so
 * 10 February plus two months is 10 April, and a day the target month lacks
 * falls back to its last one: 31 December plus two months is 28 February.
 */
export function addValidity(start: Date, validFor: ValidityDuration): Date {
  return add(start, validFor);
}
