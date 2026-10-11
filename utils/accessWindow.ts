/**
 * How much of a token's access window is left, expressed the way
 * `Intl.RelativeTimeFormat` wants it. The platform already knows how to word
 * "in 3 days" in every locale the app ships, so only picking the unit is ours.
 */
export interface RemainingTime {
  value: number
  unit: Intl.RelativeTimeFormatUnit
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
/** Calendar months and years vary in length; a visitor reading "in 2 months" does not. */
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * The largest whole unit still left before `expiresAt`, or `null` once the
 * window has closed. Always rounds down, so the visitor is never promised time
 * they do not have.
 */
export function getRemainingTime(expiresAt: Date, now: Date = new Date()): RemainingTime | null {
  const remaining = expiresAt.getTime() - now.getTime();
  if (remaining <= 0) {
    return null;
  }
  if (remaining < MINUTE) {
    return { value: Math.floor(remaining / SECOND), unit: 'second' };
  }
  if (remaining < HOUR) {
    return { value: Math.floor(remaining / MINUTE), unit: 'minute' };
  }
  if (remaining < DAY) {
    return { value: Math.floor(remaining / HOUR), unit: 'hour' };
  }
  if (remaining < MONTH) {
    return { value: Math.floor(remaining / DAY), unit: 'day' };
  }
  if (remaining < YEAR) {
    return { value: Math.floor(remaining / MONTH), unit: 'month' };
  }
  return { value: Math.floor(remaining / YEAR), unit: 'year' };
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
