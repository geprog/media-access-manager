import type { ValidityDuration } from '~/utils/accessWindow';
import { addValidity } from '~/utils/accessWindow';

export interface TokenLike {
  startsAt: Date | null
  expiresAt: Date | null
  usageLimit: number | null
  usageCount: number
}

/** Why a token is not usable right now, `null` while it still is. */
export type TokenInvalidReason = 'not_started' | 'expired' | 'usage_limit_reached';

export function getTokenInvalidReason(
  tokenRow: TokenLike,
  now: Date = new Date(),
): TokenInvalidReason | null {
  if (tokenRow.startsAt && now < tokenRow.startsAt) {
    return 'not_started';
  }
  if (tokenRow.expiresAt && now > tokenRow.expiresAt) {
    return 'expired';
  }
  if (tokenRow.usageLimit != null && tokenRow.usageCount >= tokenRow.usageLimit) {
    return 'usage_limit_reached';
  }
  return null;
}

export function isTokenValid(
  tokenRow: TokenLike,
  now: Date = new Date(),
): boolean {
  return getTokenInvalidReason(tokenRow, now) === null;
}

/** The part of a token that decides when its date window opens. */
export interface ActivatableToken {
  expiresAt: Date | null
  /**
   * Set on a token whose window starts on first use rather than on creation:
   * how long it stays valid from then on.
   */
  validFor: ValidityDuration | null
}

/**
 * The expiry a token gets from the view about to be spent, or `null` when that
 * view changes nothing — because the window already started, or because it
 * started the moment the token was created.
 */
export function getActivationExpiry(
  tokenRow: ActivatableToken,
  now: Date = new Date(),
): Date | null {
  if (tokenRow.expiresAt || !tokenRow.validFor) {
    return null;
  }
  return addValidity(now, tokenRow.validFor);
}
