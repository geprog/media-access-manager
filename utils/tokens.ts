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

/** What a batch's tokens share, for prefilling its edit form. */
export interface BatchSettings extends Pick<TokenRow, 'usageLimit' | 'expiresAt' | 'validFor'> {
  /**
   * Settings the tokens do not all share, because single tokens were edited on
   * their own. Their values above are left empty rather than picking one
   * token's to stand for the batch.
   */
  differing: { usageLimit: boolean, validity: boolean }
}

/**
 * Reads a batch's settings off its tokens. A first-use token that was already
 * opened carries its own expiry date, which is not a setting of the batch, so
 * only the duration is compared and reported for those.
 */
export function getBatchSettings(tokens: TokenRow[]): BatchSettings {
  const validityOf = (token: TokenRow) => ({
    expiresAt: token.validFor ? null : token.expiresAt,
    validFor: token.validFor,
  });
  const first = tokens[0];
  if (!first) {
    return { usageLimit: null, expiresAt: null, validFor: null, differing: { usageLimit: false, validity: false } };
  }
  const firstValidity = JSON.stringify(validityOf(first));
  const differing = {
    usageLimit: tokens.some(token => token.usageLimit !== first.usageLimit),
    validity: tokens.some(token => JSON.stringify(validityOf(token)) !== firstValidity),
  };
  return {
    usageLimit: differing.usageLimit ? null : first.usageLimit,
    ...(differing.validity ? { expiresAt: null, validFor: null } : validityOf(first)),
    differing,
  };
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
