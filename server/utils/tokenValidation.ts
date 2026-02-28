export interface TokenLike {
  startsAt: Date | null
  expiresAt: Date | null
  usageLimit: number | null
  usageCount: number
}

export function isTokenValid(
  tokenRow: TokenLike,
  now: Date = new Date(),
): boolean {
  if (tokenRow.startsAt && now < tokenRow.startsAt) {
    return false;
  }
  if (tokenRow.expiresAt && now > tokenRow.expiresAt) {
    return false;
  }
  if (tokenRow.usageLimit != null && tokenRow.usageCount >= tokenRow.usageLimit) {
    return false;
  }
  return true;
}
