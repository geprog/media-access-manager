import type { TokenValidity, ValidityDuration } from './accessWindow';
import { getEditedValidity } from './accessWindow';

/** A token as the media details page lists it. */
export interface TokenRow {
  id: string
  token: string
  name: string
  usageCount: number
  usageLimit: number | null
  expiresAt: string | null
  /** Set while a token waits for the first use that starts its validity. */
  validFor: ValidityDuration | null
  /** When the token was first opened, `null` until then. */
  firstUsedAt: string | null
  /**
   * On a group token, the most views spent on any one media of the group —
   * what its per-media limit is actually measured against.
   */
  maxMediaUsageCount?: number
  batchId: string | null
}

/** The parts of a token the page searches and groups by. */
export type FilterableToken = Pick<TokenRow, 'token' | 'batchId'>;

/**
 * Picks the tokens matching the admin's search box and groups them by batch.
 *
 * Only the token value is searched: a batch names its tokens by index, so
 * names repeat across batches and would drown a global search in matches from
 * every group. Tokens created outside a batch have no group to appear under
 * and are left out, the same way they were before the search box existed.
 */
export function groupMatchingTokensByBatch<Token extends FilterableToken>(
  tokens: Token[],
  filter: string,
): Map<string, Token[]> {
  const needle = filter.trim().toLowerCase();
  const grouped = new Map<string, Token[]>();
  for (const token of tokens) {
    if (!token.batchId) {
      continue;
    }
    if (needle && !token.token.toLowerCase().includes(needle)) {
      continue;
    }
    const group = grouped.get(token.batchId);
    if (group) {
      group.push(token);
    }
    else {
      grouped.set(token.batchId, [token]);
    }
  }
  return grouped;
}

/** What a batch's tokens were created with, for prefilling its edit form. */
export type BatchSettings = Pick<TokenRow, 'usageLimit' | 'expiresAt' | 'validFor'>;

/**
 * Reads a batch's settings off its tokens. They are created alike, but single
 * tokens can be edited afterwards, so the settings most of them share speak
 * for the batch (the earliest token on a tie). A first-use token that was
 * already opened carries its own expiry date, which is not a setting of the
 * batch, so only the duration is reported for those.
 */
export function getBatchSettings(tokens: TokenRow[]): BatchSettings {
  const counts = new Map<string, { settings: BatchSettings, count: number }>();
  for (const token of tokens) {
    const settings: BatchSettings = {
      usageLimit: token.usageLimit,
      expiresAt: token.validFor ? null : token.expiresAt,
      validFor: token.validFor,
    };
    const key = JSON.stringify(settings);
    const entry = counts.get(key);
    if (entry) {
      entry.count++;
    }
    else {
      counts.set(key, { settings, count: 1 });
    }
  }
  let best: { settings: BatchSettings, count: number } | undefined;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) {
      best = entry;
    }
  }
  return best?.settings ?? { usageLimit: null, expiresAt: null, validFor: null };
}

/** What a new validity would do to a batch's tokens that the admin may not expect. */
export interface ValidityConflicts {
  /** Tokens usable right now that the new validity would close at once. */
  closed: number
  /**
   * Tokens already running on a first-use duration whose own expiry a fixed
   * date (or none) would overwrite.
   */
  replaced: number
}

/** Counts the tokens a validity change would close or whose running expiry it would replace. */
export function getValidityConflicts(
  tokens: TokenRow[],
  validity: TokenValidity,
  now: Date = new Date(),
): ValidityConflicts {
  const conflicts: ValidityConflicts = { closed: 0, replaced: 0 };
  for (const token of tokens) {
    const isOpen = !token.expiresAt || new Date(token.expiresAt) > now;
    const firstUsedAt = token.firstUsedAt ? new Date(token.firstUsedAt) : null;
    const { expiresAt } = getEditedValidity({ firstUsedAt }, validity);
    if (isOpen && expiresAt && expiresAt <= now) {
      conflicts.closed++;
    }
    else if (!validity.validFor && token.validFor && token.expiresAt) {
      conflicts.replaced++;
    }
  }
  return conflicts;
}

/**
 * Counts the tokens a new usage limit would use up at once, leaving out those
 * already used up under the old one. For a group token that means losing
 * access to at least one media of the group.
 */
export function getUsageLimitConflicts(tokens: TokenRow[], usageLimit: number | null): number {
  if (usageLimit == null) {
    return 0;
  }
  return tokens.filter((token) => {
    const used = token.maxMediaUsageCount ?? token.usageCount;
    const wasUsedUp = token.usageLimit != null && used >= token.usageLimit;
    return used >= usageLimit && !wasUsedUp;
  }).length;
}
