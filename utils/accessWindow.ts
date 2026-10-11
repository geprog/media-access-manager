/**
 * How much of a token's access window is left, in the shape
 * `Intl.DurationFormat` takes. The platform already knows how to word
 * "1 hour, 59 minutes" in every locale the app ships, so only picking the
 * units is ours. Units with nothing left in them are left out.
 */
export type RemainingTime = Partial<Record<RemainingTimeUnit, number>>;

type RemainingTimeUnit = 'years' | 'months' | 'days' | 'hours' | 'minutes' | 'seconds';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
/** Calendar months and years vary in length; a visitor reading "in 2 months" does not. */
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** Largest first; each unit is followed by the one shown beside it. */
const UNITS: Array<[RemainingTimeUnit, number]> = [
  ['years', YEAR],
  ['months', MONTH],
  ['days', DAY],
  ['hours', HOUR],
  ['minutes', MINUTE],
  ['seconds', SECOND],
];

/**
 * The largest whole unit still left before `expiresAt` together with the next
 * smaller one ("1 hour, 59 minutes", "2 months, 5 days"), or `null` once the
 * window has closed. Below an hour minutes stand alone: the page only
 * refreshes every half minute, so a seconds count would always be stale.
 * Always rounds down, so the visitor is never promised time they do not have.
 */
export function getRemainingTime(expiresAt: Date, now: Date = new Date()): RemainingTime | null {
  const remaining = expiresAt.getTime() - now.getTime();
  if (remaining <= 0) {
    return null;
  }
  // Under a second is still time left, counted as zero seconds.
  const found = UNITS.findIndex(([, size]) => remaining >= size);
  const index = found === -1 ? UNITS.length - 1 : found;
  const [unit, size] = UNITS[index]!;
  const result: RemainingTime = { [unit]: Math.floor(remaining / size) };
  const next = UNITS[index + 1];
  if (next && unit !== 'minutes' && unit !== 'seconds') {
    const [nextUnit, nextSize] = next;
    const rest = Math.floor((remaining % size) / nextSize);
    if (rest > 0) {
      result[nextUnit] = rest;
    }
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
export type DurationUnit = 'minute' | 'hour' | 'day' | 'week';

const UNIT_SECONDS: Record<DurationUnit, number> = {
  week: WEEK / SECOND,
  day: DAY / SECOND,
  hour: HOUR / SECOND,
  minute: MINUTE / SECOND,
};

export function durationToSeconds(value: number, unit: DurationUnit): number {
  return value * UNIT_SECONDS[unit];
}

/**
 * A stored duration in the largest unit that holds it exactly, so "7 days"
 * entered by an admin reads back as "1 week" and never as "168 hours".
 */
export function splitDuration(seconds: number): { value: number, unit: DurationUnit } {
  for (const unit of ['week', 'day', 'hour'] as const) {
    if (seconds % UNIT_SECONDS[unit] === 0) {
      return { value: seconds / UNIT_SECONDS[unit], unit };
    }
  }
  return { value: Math.round(seconds / UNIT_SECONDS.minute), unit: 'minute' };
}
