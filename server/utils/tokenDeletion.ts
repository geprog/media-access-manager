import type { SQL } from 'drizzle-orm';
import type { DbTransaction } from './db';
import { inArray } from 'drizzle-orm';
import { tokenMediaUsage, tokens, tokenViews } from '../db/schema';

/**
 * Removes the tokens `where` selects for good, along with the views they spent
 * and their per-media counters, so no history is left pointing at a token that
 * is gone. Every deletion of tokens goes through here, so a table added for
 * tokens later only needs clearing in one place. Returns how many tokens went.
 *
 * `where` is required: drizzle reads a missing condition as "every row".
 */
export function deleteTokensWhere(tx: DbTransaction, where: SQL): number {
  const tokenIds = tx.select({ id: tokens.id }).from(tokens).where(where);
  tx.delete(tokenViews).where(inArray(tokenViews.tokenId, tokenIds)).run();
  tx.delete(tokenMediaUsage).where(inArray(tokenMediaUsage.tokenId, tokenIds)).run();
  return tx.delete(tokens).where(where).run().changes;
}
