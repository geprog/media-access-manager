import type { TokenLike } from './tokenValidation';
import { describe, expect, it } from 'vitest';
import { getTokenInvalidReason, isTokenValid } from './tokenValidation';

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
});
