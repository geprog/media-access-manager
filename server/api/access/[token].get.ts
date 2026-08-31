import { getMediaById } from '../../services/mediaService';
import {
  denialFor,
  getAccessDenial,
  getGroupTokenAccess,
  getGroupWindowReason,
  validateAndConsumeToken,
  validateToken,
} from '../../services/tokenService';
import { requireViewableMedia } from '../../utils/publicAccess';

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token');
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request' });
  }
  const session = await getUserSession(event);
  const user = session?.user as { role?: string } | undefined;
  const isAdmin = user?.role === 'admin';

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
      });
    }
    return {
      type: 'group' as const,
      title: group.name,
      access: {
        expiresAt: tokenRow.expiresAt?.toISOString() ?? null,
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
    };
  }

  const tokenRow = isAdmin
    ? await validateToken(token)
    : await validateAndConsumeToken(token);
  if (!tokenRow?.mediaId) {
    const denial = await getAccessDenial(token);
    const deniedMedia = denial.mediaId ? await getMediaById(denial.mediaId) : null;
    throw denied({
      reason: denial.reason,
      title: deniedMedia?.title ?? null,
      // Admins check their own links here; the id sends them on to the media
      // instead of a support mail. Visitors have no use for it.
      mediaId: isAdmin ? denial.mediaId : null,
      groupId: null,
    });
  }
  const viewable = await requireViewableMedia(tokenRow.mediaId);
  return {
    type: 'media' as const,
    title: viewable.title,
    embed: viewable.embed,
    // Only the limits of the visitor's own token, so they can see how much of
    // their access window is left. Nothing about the token's owner or batch.
    access: {
      expiresAt: tokenRow.expiresAt?.toISOString() ?? null,
      usageLimit: tokenRow.usageLimit,
      usageCount: tokenRow.usageCount,
    },
  };
});

interface DenialData {
  reason: string
  title: string | null
  mediaId: string | null
  groupId: string | null
}

function denied(data: DenialData) {
  return createError({ statusCode: 404, statusMessage: 'Not Found', data });
}
