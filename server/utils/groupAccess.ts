import type { TokenInvalidReason, TokenLike } from './tokenValidation';
import { getTokenInvalidReason } from './tokenValidation';

/** A group token's limits, which it spends separately on every media. */
export type GroupTokenLike = Omit<TokenLike, 'usageCount'>;

export interface GroupMediaAccess {
  mediaId: string
  /** Why this media cannot be opened right now, `null` while it still can. */
  blockedBy: TokenInvalidReason | null
  /** Views this token already spent on this media. */
  usageCount: number
  /** Views allowed on this media, `null` when unlimited. */
  usageLimit: number | null
}

/**
 * How far a group token still reaches into each media of its group.
 *
 * The token's date window is shared — it either has started and not expired,
 * or the whole group is closed — while its usage limit is spent per media, so
 * a visitor who watched one video three times keeps the other videos.
 */
export function getGroupMediaAccess(
  token: GroupTokenLike,
  mediaIds: string[],
  usageByMediaId: ReadonlyMap<string, number>,
  now: Date = new Date(),
): GroupMediaAccess[] {
  return mediaIds.map((mediaId) => {
    const usageCount = usageByMediaId.get(mediaId) ?? 0;
    return {
      mediaId,
      blockedBy: getTokenInvalidReason({ ...token, usageCount }, now),
      usageCount,
      usageLimit: token.usageLimit,
    };
  });
}

/**
 * What closes a group token as a whole, `null` while it is open.
 *
 * Only the shared date window can do that: a used-up media blocks itself, not
 * the group, so the usage limit is deliberately left out here. A group whose
 * date window has closed is better shown as the one "your access has ended"
 * page than as a list in which nothing can be opened.
 */
export function getGroupWindowReason(
  token: GroupTokenLike,
  now: Date = new Date(),
): TokenInvalidReason | null {
  return getTokenInvalidReason({ ...token, usageCount: 0 }, now);
}
