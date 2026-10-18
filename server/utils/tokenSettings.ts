import type { TokenValidity } from '~/utils/accessWindow';
import { parseValidityDuration } from '~/utils/accessWindow';

/** Settings an admin can change on tokens already handed out. Only what is set is touched. */
export interface TokenSettingsChanges {
  /** `null` lifts the limit. */
  usageLimit?: number | null
  validity?: TokenValidity
}

/**
 * The settings changes in a request body, or `null` when any of them is
 * malformed. Sending `expiresAt` or `validFor` replaces the validity as a
 * whole, the same either-or as on creation.
 */
export function parseTokenSettingsChanges(body: unknown): TokenSettingsChanges | null {
  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const changes: TokenSettingsChanges = {};

  if (input.usageLimit !== undefined) {
    const usageLimit = input.usageLimit;
    if (usageLimit !== null && (!Number.isInteger(usageLimit) || (usageLimit as number) < 1)) {
      return null;
    }
    changes.usageLimit = usageLimit as number | null;
  }

  if (input.validFor != null) {
    const validFor = parseValidityDuration(input.validFor);
    if (!validFor || input.expiresAt) {
      return null;
    }
    changes.validity = { expiresAt: null, validFor };
  }
  else if (input.expiresAt !== undefined) {
    const expiresAt = input.expiresAt ? new Date(input.expiresAt as string) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return null;
    }
    changes.validity = { expiresAt, validFor: null };
  }

  return changes;
}
