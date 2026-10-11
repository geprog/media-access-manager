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
      expect(getRemainingTime(inFuture(30 * SECOND), now)).toEqual({ value: 30, unit: 'second' });
    });

    it('reports minutes below an hour', () => {
      expect(getRemainingTime(inFuture(45 * MINUTE), now)).toEqual({ value: 45, unit: 'minute' });
    });

    it('reports hours below a day', () => {
      expect(getRemainingTime(inFuture(5 * HOUR), now)).toEqual({ value: 5, unit: 'hour' });
    });

    it('reports days below a month', () => {
      expect(getRemainingTime(inFuture(6 * DAY), now)).toEqual({ value: 6, unit: 'day' });
    });

    it('reports months below a year', () => {
      expect(getRemainingTime(inFuture(90 * DAY), now)).toEqual({ value: 3, unit: 'month' });
    });

    it('reports years from a year on', () => {
      expect(getRemainingTime(inFuture(400 * DAY), now)).toEqual({ value: 1, unit: 'year' });
    });

    it('rounds down so the shown time is never longer than the real one', () => {
      expect(getRemainingTime(inFuture(2 * HOUR + 59 * MINUTE), now)).toEqual({ value: 2, unit: 'hour' });
    });

    it('never rounds down to zero of a unit', () => {
      expect(getRemainingTime(inFuture(HOUR - SECOND), now)).toEqual({ value: 59, unit: 'minute' });
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
