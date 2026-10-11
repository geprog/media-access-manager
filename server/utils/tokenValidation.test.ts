import type { TokenLike } from './tokenValidation';
import { describe, expect, it } from 'vitest';
import { getActivationExpiry, getTokenInvalidReason, isTokenValid } from './tokenValidation';

describe('tokenValidation', () => {
  describe('isTokenValid', () => {
    const baseToken: TokenLike = {
      startsAt: null,
      expiresAt: null,
      usageLimit: null,
      usageCount: 0,
    };

    it('returns true when no restrictions', () => {
      expect(isTokenValid(baseToken)).toBe(true);
    });

    it('returns false when now < startsAt', () => {
      const token = {
        ...baseToken,
        startsAt: new Date(Date.now() + 86400000),
      };
      expect(isTokenValid(token)).toBe(false);
    });

    it('returns true when now >= startsAt', () => {
      const token = {
        ...baseToken,
        startsAt: new Date(Date.now() - 86400000),
      };
      expect(isTokenValid(token)).toBe(true);
    });

    it('returns false when now > expiresAt', () => {
      const token = {
        ...baseToken,
        expiresAt: new Date(Date.now() - 86400000),
      };
      expect(isTokenValid(token)).toBe(false);
    });

    it('returns true when now <= expiresAt', () => {
      const token = {
        ...baseToken,
        expiresAt: new Date(Date.now() + 86400000),
      };
      expect(isTokenValid(token)).toBe(true);
    });

    it('returns false when usageCount >= usageLimit', () => {
      const token = {
        ...baseToken,
        usageLimit: 5,
        usageCount: 5,
      };
      expect(isTokenValid(token)).toBe(false);
    });

    it('returns false when usageCount > usageLimit', () => {
      const token = {
        ...baseToken,
        usageLimit: 5,
        usageCount: 6,
      };
      expect(isTokenValid(token)).toBe(false);
    });

    it('returns true when usageCount < usageLimit', () => {
      const token = {
        ...baseToken,
        usageLimit: 5,
        usageCount: 2,
      };
      expect(isTokenValid(token)).toBe(true);
    });

    it('returns false when all restrictions fail', () => {
      const token = {
        ...baseToken,
        startsAt: new Date(Date.now() + 86400000),
        expiresAt: new Date(Date.now() - 86400000),
        usageLimit: 1,
        usageCount: 1,
      };
      expect(isTokenValid(token)).toBe(false);
    });
  });

  describe('getTokenInvalidReason', () => {
    const baseToken: TokenLike = {
      startsAt: null,
      expiresAt: null,
      usageLimit: null,
      usageCount: 0,
    };

    it('returns null while the token is usable', () => {
      expect(getTokenInvalidReason(baseToken)).toBeNull();
    });

    it('reports a token whose start date has not been reached', () => {
      const token = { ...baseToken, startsAt: new Date(Date.now() + 86400000) };
      expect(getTokenInvalidReason(token)).toBe('not_started');
    });

    it('reports a token past its expiry date', () => {
      const token = { ...baseToken, expiresAt: new Date(Date.now() - 86400000) };
      expect(getTokenInvalidReason(token)).toBe('expired');
    });

    it('reports a token that used up its views', () => {
      const token = { ...baseToken, usageLimit: 2, usageCount: 2 };
      expect(getTokenInvalidReason(token)).toBe('usage_limit_reached');
    });

    // A visitor who arrives too early is told to wait, not that their access
    // ran out, so the start date wins over the other two.
    it('reports the start date first when several restrictions fail', () => {
      const token = {
        ...baseToken,
        startsAt: new Date(Date.now() + 86400000),
        expiresAt: new Date(Date.now() - 86400000),
        usageLimit: 1,
        usageCount: 1,
      };
      expect(getTokenInvalidReason(token)).toBe('not_started');
    });
  });

  describe('getActivationExpiry', () => {
    const now = new Date('2026-10-11T12:00:00Z');
    const DAY_SECONDS = 24 * 60 * 60;

    it('starts the window of a token waiting for its first use', () => {
      const token = { expiresAt: null, validForSeconds: 7 * DAY_SECONDS };
      expect(getActivationExpiry(token, now)).toEqual(new Date('2026-10-18T12:00:00Z'));
    });

    it('leaves a token alone whose window already started', () => {
      const token = { expiresAt: new Date('2026-10-12T12:00:00Z'), validForSeconds: 7 * DAY_SECONDS };
      expect(getActivationExpiry(token, now)).toBeNull();
    });

    it('leaves a token alone whose window started on creation', () => {
      expect(getActivationExpiry({ expiresAt: null, validForSeconds: null }, now)).toBeNull();
    });
  });
});
