/** A token as the media details page lists it. */
export interface TokenRow {
  token: string
  name: string
  usageCount: number
  usageLimit: number | null
  expiresAt: string | null
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
