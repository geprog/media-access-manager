import { describe, expect, it } from 'vitest';
import { durationToSeconds, getRemainingTime, getRemainingViews, splitDuration } from './accessWindow';

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

    it('reports months with the days left over', () => {
      expect(getRemainingTime(inFuture(95 * DAY + 5 * HOUR), now)).toEqual({ months: 3, days: 5 });
    });

    it('reports years with the months left over', () => {
      expect(getRemainingTime(inFuture(400 * DAY), now)).toEqual({ years: 1, months: 1 });
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

  describe('splitDuration', () => {
    it('reports whole weeks as weeks', () => {
      expect(splitDuration(14 * DAY / SECOND)).toEqual({ value: 2, unit: 'week' });
    });

    it('reports whole days that are no whole week as days', () => {
      expect(splitDuration(10 * DAY / SECOND)).toEqual({ value: 10, unit: 'day' });
    });

    it('reports whole hours that are no whole day as hours', () => {
      expect(splitDuration(36 * HOUR / SECOND)).toEqual({ value: 36, unit: 'hour' });
    });

    it('falls back to minutes for anything finer', () => {
      expect(splitDuration(90 * MINUTE / SECOND)).toEqual({ value: 90, unit: 'minute' });
    });
  });

  describe('durationToSeconds', () => {
    it('converts each unit into seconds', () => {
      expect(durationToSeconds(3, 'hour')).toBe(3 * HOUR / SECOND);
      expect(durationToSeconds(2, 'day')).toBe(2 * DAY / SECOND);
      expect(durationToSeconds(1, 'week')).toBe(7 * DAY / SECOND);
    });

    it('round-trips through splitDuration', () => {
      expect(splitDuration(durationToSeconds(5, 'day'))).toEqual({ value: 5, unit: 'day' });
    });
  });
});
