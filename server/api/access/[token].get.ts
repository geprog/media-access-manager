import { denialFor, getGroupTokenAccess, getGroupWindowReason } from '../../services/tokenService';
import { denied, isAdminRequest, openMediaToken, purchaseOfferFor } from '../../utils/publicAccess';

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const isAdmin = await isAdminRequest(event);

  // A group token unlocks several media, so this page only lists them. Nothing
  // is spent until the visitor picks one — see `[token]/[mediaId].get.ts`.
  const groupAccess = await getGroupTokenAccess(token);
  if (groupAccess) {
    const { token: tokenRow, group } = groupAccess;
    // Only the shared date window can close the whole group; a used-up media
    // blocks itself and still belongs on the list.
    const windowReason = getGroupWindowReason(tokenRow);
    if (windowReason) {
      const denial = denialFor(tokenRow, windowReason);
      throw denied({
        reason: denial.reason,
        // An expired link still names its group, so the visitor knows which
        // access they lost; a link that never worked names nothing.
        title: denial.reason === 'token_expired' ? group.name : null,
        mediaId: null,
        // Admins check their own links here, so they get the way back into the
        // group instead of a support mail.
        groupId: isAdmin ? denial.groupId : null,
        ...await purchaseOfferFor(tokenRow, isAdmin),
      });
    }
    return {
      type: 'group' as const,
      title: group.name,
      access: {
        expiresAt: tokenRow.expiresAt?.toISOString() ?? null,
        // Until the first media is watched, a token whose validity starts on
        // first use has no expiry yet — only the duration it will run for.
        validFor: tokenRow.validFor,
        // The limit belongs to each media on its own, so it is reported per
        // entry below rather than as one number for the whole token.
        usageLimit: tokenRow.usageLimit,
      },
      media: groupAccess.media.map(entry => ({
        id: entry.media.id,
        title: entry.media.title,
        blockedBy: entry.blockedBy,
        usageLimit: entry.usageLimit,
        usageCount: entry.usageCount,
      })),
      // Some media used up while the window is still open: buying again is
      // offered beside the list, the same way as on an expired link.
      ...await purchaseOfferFor(tokenRow, isAdmin),
    };
  }

  // A single-media token plays right away unless the view would cost the
  // visitor something; then only a preview comes back, and the page asks before
  // spending it through `[token].post.ts`.
  return openMediaToken(event, token, { confirmed: false });
});
