import { describe, expect, it } from 'vitest';
import { addValidity, getEditedValidity, getRemainingTime, getRemainingViews, parseValidityDuration } from './accessWindow';

const now = new Date('2026-08-29T12:00:00Z');

function inFuture(ms: number) {
  return new Date(now.getTime() + ms);
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('accessWindow', () => {
  describe('getRemainingTime', () => {
    it('returns null when the expiry has passed', () => {
      expect(getRemainingTime(inFuture(-SECOND), now)).toBeNull();
    });

    it('returns null when the expiry is exactly now', () => {
      expect(getRemainingTime(now, now)).toBeNull();
    });

    it('reports seconds below a minute', () => {
      expect(getRemainingTime(inFuture(30 * SECOND), now)).toEqual({ seconds: 30 });
    });

    it('reports only minutes below an hour', () => {
      expect(getRemainingTime(inFuture(45 * MINUTE + 30 * SECOND), now)).toEqual({ minutes: 45 });
    });

    it('reports hours with the minutes left over', () => {
      expect(getRemainingTime(inFuture(HOUR + 59 * MINUTE + 59 * SECOND), now)).toEqual({ hours: 1, minutes: 59 });
    });

    it('reports days with the hours left over', () => {
      expect(getRemainingTime(inFuture(6 * DAY + 3 * HOUR), now)).toEqual({ days: 6, hours: 3 });
    });

    // Months and years follow the calendar, so they are checked between local
    // calendar dates: a fixed number of milliseconds would shift by an hour
    // wherever daylight saving time starts or ends in between.
    it('counts months by the calendar with the days left over', () => {
      expect(getRemainingTime(new Date(2026, 10, 3, 12), new Date(2026, 7, 29, 12))).toEqual({ months: 2, days: 5 });
    });

    it('counts a calendar month as one month however many days it has', () => {
      expect(getRemainingTime(new Date(2027, 2, 1, 12), new Date(2027, 1, 1, 12))).toEqual({ months: 1 });
      expect(getRemainingTime(new Date(2026, 8, 1, 12), new Date(2026, 7, 1, 12))).toEqual({ months: 1 });
    });

    it('reports years with the months left over', () => {
      expect(getRemainingTime(new Date(2027, 9, 3, 12), new Date(2026, 7, 29, 12))).toEqual({ years: 1, months: 1 });
    });

    it('leaves out a smaller unit with nothing left in it', () => {
      expect(getRemainingTime(inFuture(5 * HOUR + 30 * SECOND), now)).toEqual({ hours: 5 });
    });

    it('rounds down so the shown time is never longer than the real one', () => {
      expect(getRemainingTime(inFuture(2 * HOUR - SECOND), now)).toEqual({ hours: 1, minutes: 59 });
    });

    it('never rounds down to zero of a unit', () => {
      expect(getRemainingTime(inFuture(HOUR - SECOND), now)).toEqual({ minutes: 59 });
    });
  });

  describe('getRemainingViews', () => {
    it('returns null when the token has no usage limit', () => {
      expect(getRemainingViews(null, 3)).toBeNull();
    });

    it('returns the views left after the current one', () => {
      expect(getRemainingViews(5, 2)).toBe(3);
    });

    it('returns zero once the limit is reached', () => {
      expect(getRemainingViews(5, 5)).toBe(0);
    });

    it('never returns a negative count', () => {
      expect(getRemainingViews(5, 8)).toBe(0);
    });
  });

  describe('addValidity', () => {
    it('adds calendar months rather than a fixed number of days', () => {
      expect(addValidity(new Date(2026, 1, 10, 9, 30), { months: 2 })).toEqual(new Date(2026, 3, 10, 9, 30));
    });

    it('ends on the last day of a shorter month instead of spilling over', () => {
      expect(addValidity(new Date(2026, 11, 31, 9), { months: 2 })).toEqual(new Date(2027, 1, 28, 9));
    });

    it('adds weeks, days and hours', () => {
      const start = new Date(2026, 7, 29, 12);
      expect(addValidity(start, { weeks: 1 })).toEqual(new Date(2026, 8, 5, 12));
      expect(addValidity(start, { days: 3 })).toEqual(new Date(2026, 8, 1, 12));
      expect(addValidity(start, { hours: 2 })).toEqual(new Date(2026, 7, 29, 14));
    });
  });

  describe('parseValidityDuration', () => {
    it('accepts one unit with a positive whole number', () => {
      expect(parseValidityDuration({ months: 2 })).toEqual({ months: 2 });
      expect(parseValidityDuration({ hours: 1 })).toEqual({ hours: 1 });
    });

    it('turns down anything that is not a single known unit', () => {
      expect(parseValidityDuration(null)).toBeNull();
      expect(parseValidityDuration(7200)).toBeNull();
      expect(parseValidityDuration({})).toBeNull();
      expect(parseValidityDuration({ seconds: 30 })).toBeNull();
      expect(parseValidityDuration({ days: 1, hours: 2 })).toBeNull();
    });

    it('turns down a count that is not a positive whole number', () => {
      expect(parseValidityDuration({ days: 0 })).toBeNull();
      expect(parseValidityDuration({ days: -1 })).toBeNull();
      expect(parseValidityDuration({ days: 1.5 })).toBeNull();
      expect(parseValidityDuration({ days: '3' })).toBeNull();
    });
  });
  describe('getEditedValidity', () => {
    const firstUsedAt = new Date(2026, 11, 31, 12);

    it('gives every token the same fixed expiry date', () => {
      const expiresAt = new Date(2027, 5, 1);
      expect(getEditedValidity({ firstUsedAt }, { expiresAt, validFor: null }))
        .toEqual({ expiresAt, validFor: null });
    });

    it('drops the expiry date of a token switched to no expiry', () => {
      expect(getEditedValidity({ firstUsedAt }, { expiresAt: null, validFor: null }))
        .toEqual({ expiresAt: null, validFor: null });
    });

    it('keeps a token that was never opened waiting for its first use', () => {
      expect(getEditedValidity({ firstUsedAt: null }, { expiresAt: null, validFor: { weeks: 2 } }))
        .toEqual({ expiresAt: null, validFor: { weeks: 2 } });
    });

    it('counts the new duration from the first use of a token already opened', () => {
      expect(getEditedValidity({ firstUsedAt }, { expiresAt: null, validFor: { months: 2 } }))
        .toEqual({ expiresAt: new Date(2027, 1, 28, 12), validFor: { months: 2 } });
    });
  });
});
