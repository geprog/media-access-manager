import type { H3Event } from 'h3';
import type { Token } from '../db/schema';
import type { ViewableMedia } from '../services/mediaService';
import type { OpenPayment } from '../services/paymentService';
import type { PurchaseOption } from './purchase';
import type { ValidityDuration } from '~/utils/accessWindow';
import { getMediaById, getViewableMedia } from '../services/mediaService';
import { getPurchaseOffer } from '../services/paymentService';
import {
  consumeGroupMediaView,
  denialFor,
  findTokenByValue,
  getAccessDenial,
  resolveGroupMedia,
  validateAndConsumeToken,
  validateToken,
} from '../services/tokenService';
import { requiresViewConfirmation } from './tokenValidation';

/**
 * The embed for a media whose token was already accepted. Any failure from
 * here on is a provider problem (video deleted, embedding disabled, API down)
 * and must not be reported to the visitor as an invalid link.
 */
export async function requireViewableMedia(mediaId: string): Promise<ViewableMedia> {
  let viewable: ViewableMedia | null;
  try {
    viewable = await getViewableMedia(mediaId);
  }
  catch (error) {
    console.error(`Failed to load embed content for media ${mediaId}:`, error);
    viewable = null;
  }
  if (!viewable) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Bad Gateway',
      data: { reason: 'media_unavailable' },
    });
  }
  return viewable;
}

export async function isAdminRequest(event: H3Event): Promise<boolean> {
  const session = await getUserSession(event);
  const user = session?.user as { role?: string } | undefined;
  return user?.role === 'admin';
}

interface DenialData {
  reason: string
  title: string | null
  mediaId: string | null
  groupId: string | null
  /** What the visitor may buy to get access again; empty when nothing is for sale. */
  purchaseOptions: PurchaseOption[]
  /** A payment the visitor started and has not finished, to continue instead. */
  openPayment: OpenPayment | null
}

export function denied(data: DenialData) {
  return createError({ statusCode: 404, statusMessage: 'Not Found', data });
}

/**
 * What the page offers to buy, and the payment it would continue instead.
 * Admins checking their own links are sent to the media or group instead of
 * a checkout, so they are offered nothing.
 */
export async function purchaseOfferFor(
  tokenRow: Token | null,
  isAdmin: boolean,
): Promise<Pick<DenialData, 'purchaseOptions' | 'openPayment'>> {
  if (!tokenRow || isAdmin) {
    return { purchaseOptions: [], openPayment: null };
  }
  const { options, openPayment } = await getPurchaseOffer(tokenRow);
  return { purchaseOptions: options, openPayment };
}

/** Only the limits of the visitor's own token, nothing about its owner or batch. */
interface AccessWindow {
  expiresAt: Date | null
  validFor: ValidityDuration | null
  usageLimit: number | null
  usageCount: number
}

function publicAccessWindow(access: AccessWindow) {
  return {
    expiresAt: access.expiresAt?.toISOString() ?? null,
    validFor: access.validFor,
    usageLimit: access.usageLimit,
    usageCount: access.usageCount,
  };
}

/**
 * What the page shows before a view is spent: the title and how much access
 * is left, but no embed — the visitor has not chosen to watch yet. The counts
 * are those from before the view.
 */
function pendingView(title: string, access: AccessWindow) {
  return {
    type: 'media' as const,
    confirmationRequired: true as const,
    title,
    embed: null,
    access: publicAccessWindow(access),
  };
}

function playableView(viewable: ViewableMedia, access: AccessWindow) {
  return {
    type: 'media' as const,
    confirmationRequired: false as const,
    title: viewable.title,
    embed: viewable.embed,
    access: publicAccessWindow(access),
  };
}

export interface OpenOptions {
  /**
   * The visitor explicitly chose to watch. Without it a token whose views are
   * limited, or whose validity starts on first use, is only previewed, so
   * opening the link by accident — or a link preview bot fetching it — does
   * not cost anything.
   */
  confirmed: boolean
}

/**
 * Opens the media of a single-media token. Admins previewing their own link
 * never spend a view, so they are never asked to confirm one either.
 */
export async function openMediaToken(event: H3Event, token: string, { confirmed }: OpenOptions) {
  const isAdmin = await isAdminRequest(event);
  const tokenRow = await validateToken(token);
  if (tokenRow?.mediaId && !isAdmin && !confirmed && requiresViewConfirmation(tokenRow)) {
    const media = await getMediaById(tokenRow.mediaId);
    if (!media) {
      throw createError({ statusCode: 502, statusMessage: 'Bad Gateway', data: { reason: 'media_unavailable' } });
    }
    return pendingView(media.title, tokenRow);
  }

  const spent = tokenRow && !isAdmin ? await validateAndConsumeToken(token) : tokenRow;
  if (!spent?.mediaId) {
    const denial = await getAccessDenial(token);
    const deniedMedia = denial.mediaId ? await getMediaById(denial.mediaId) : null;
    const expiredToken = denial.reason === 'token_expired' ? await findTokenByValue(token) : null;
    throw denied({
      reason: denial.reason,
      title: deniedMedia?.title ?? null,
      // Admins check their own links here; the id sends them on to the media
      // instead of a support mail. Visitors have no use for it.
      mediaId: isAdmin ? denial.mediaId : null,
      groupId: null,
      ...await purchaseOfferFor(expiredToken, isAdmin),
    });
  }
  const viewable = await requireViewableMedia(spent.mediaId);
  return playableView(viewable, spent);
}

/**
 * Opens one media of a group token. Spending a view spends it on this media
 * alone — the token's other media keep their own budget.
 */
export async function openGroupMedia(
  event: H3Event,
  token: string,
  mediaId: string,
  { confirmed }: OpenOptions,
) {
  const isAdmin = await isAdminRequest(event);
  const resolved = await resolveGroupMedia(token, mediaId);
  if (!resolved) {
    // Unknown token, single-media token, or a media outside this token's
    // group: all a link that leads nowhere, and none of it worth explaining.
    throw denied({
      reason: 'invalid_token',
      title: null,
      mediaId: null,
      groupId: null,
      purchaseOptions: [],
      openPayment: null,
    });
  }
  if (resolved.blockedBy) {
    const denial = denialFor(resolved.token, resolved.blockedBy);
    throw denied({
      reason: denial.reason,
      title: denial.reason === 'token_expired' ? resolved.media.title : null,
      // The token belongs to the group, so an admin checking it is sent
      // there rather than to the one media they happened to click.
      mediaId: null,
      groupId: isAdmin ? denial.groupId : null,
      // Renewing buys the whole group again, not just this media.
      ...await purchaseOfferFor(resolved.token, isAdmin),
    });
  }
  const current = { ...resolved.token, usageCount: resolved.usageCount };
  if (!isAdmin && !confirmed && requiresViewConfirmation(current)) {
    return pendingView(resolved.media.title, current);
  }

  // The embed is fetched before the view is booked: a group token has a budget
  // per media, and losing one of a handful of views to a video that never
  // loaded would quietly eat access the visitor never got. A single-media
  // token has nothing to pick from and books first, as it always has.
  const viewable = await requireViewableMedia(resolved.media.id);
  // Admins previewing their own link must not use up a visitor's view, nor
  // start the window of a token whose validity runs from its first use.
  const { usageCount, expiresAt } = isAdmin
    ? current
    : await consumeGroupMediaView(resolved.token, resolved.media.id);
  return playableView(viewable, { ...current, usageCount, expiresAt });
}
