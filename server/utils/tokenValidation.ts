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
