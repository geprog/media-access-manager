import type { TokenLike } from './tokenValidation';
import { describe, expect, it } from 'vitest';
import { getActivationExpiry, getTokenInvalidReason, isTokenValid, requiresViewConfirmation } from './tokenValidation';

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
    const now = new Date(2026, 11, 31, 12);

    it('starts the window of a token waiting for its first use', () => {
      const token = { expiresAt: null, validFor: { days: 7 } };
      expect(getActivationExpiry(token, now)).toEqual(new Date(2027, 0, 7, 12));
    });

    it('counts months by the calendar', () => {
      const token = { expiresAt: null, validFor: { months: 2 } };
      expect(getActivationExpiry(token, now)).toEqual(new Date(2027, 1, 28, 12));
    });

    it('leaves a token alone whose window already started', () => {
      const token = { expiresAt: new Date(2027, 0, 1), validFor: { days: 7 } };
      expect(getActivationExpiry(token, now)).toBeNull();
    });

    it('leaves a token alone whose window started on creation', () => {
      expect(getActivationExpiry({ expiresAt: null, validFor: null }, now)).toBeNull();
    });
  });

  describe('requiresViewConfirmation', () => {
    const unlimited = { expiresAt: null, validFor: null, usageLimit: null };

    it('lets an unlimited link play straight away', () => {
      expect(requiresViewConfirmation(unlimited)).toBe(false);
    });

    it('lets a link with a fixed expiry play straight away', () => {
      expect(requiresViewConfirmation({ ...unlimited, expiresAt: new Date(2027, 0, 1) })).toBe(false);
    });

    it('asks before spending one of a limited number of views', () => {
      expect(requiresViewConfirmation({ ...unlimited, usageLimit: 3 })).toBe(true);
    });

    it('asks before starting a validity that runs from first use', () => {
      expect(requiresViewConfirmation({ ...unlimited, validFor: { days: 7 } })).toBe(true);
    });

    it('lets a link play whose first-use validity already started', () => {
      const token = { expiresAt: new Date(2027, 0, 1), validFor: { days: 7 }, usageLimit: null };
      expect(requiresViewConfirmation(token)).toBe(false);
    });
  });
});
