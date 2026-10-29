import type { Token } from '../db/schema';
import type { MollieApi, MolliePayment } from '../utils/mollieApi';
import type { PurchaseMetadata, PurchaseOption, PurchasePeriod, PurchaseStatus } from '../utils/purchase';
import { toMinorUnits, toMollieAmount } from '../../utils/money';
import { createMollieApi } from '../utils/mollieApi';
import {
  buildPaymentDescription,
  classifyPaymentStatus,
  getPurchaseOptions,
  isPaymentRecent,
  isPaymentReversed,
  parsePurchaseMetadata,
  toMollieLocale,
} from '../utils/purchase';
import { getMediaGroupById } from './mediaGroupService';
import { getMediaById } from './mediaService';
import { recordPaymentNotice } from './paymentNoticeService';
import {
  applyTokenPurchase,
  clearOpenPayment,
  findTokenById,
  findTokenByValue,
  isTokenRenewable,
  revertTokenPurchase,
  setOpenPayment,
} from './tokenService';

let client: MollieApi | null = null;

/** `null` while no API key is configured, which switches purchasing off. */
function useMollie(): MollieApi | null {
  const { apiKey, apiEndpoint } = useRuntimeConfig().mollie;
  if (!apiKey) {
    return null;
  }
  client ??= createMollieApi({ apiKey, apiEndpoint });
  return client;
}

export function isPurchasingEnabled(): boolean {
  return !!useRuntimeConfig().mollie.apiKey;
}

function useCurrency(): string {
  return useRuntimeConfig().public.payment.currency || 'EUR';
}

interface PurchaseTarget {
  target: PurchaseMetadata['target']
  targetId: string
  /** The name the customer finds on the checkout page and their statement. */
  title: string
  options: PurchaseOption[]
}

/**
 * A token is sold at its own target's price: a single-media token at its
 * media's, a group token at its group's.
 */
async function getPurchaseTarget(tokenRow: Token): Promise<PurchaseTarget | null> {
  const currency = useCurrency();
  if (tokenRow.groupId) {
    const group = await getMediaGroupById(tokenRow.groupId);
    return group
      ? { target: 'group', targetId: group.id, title: group.name, options: getPurchaseOptions(group, currency) }
      : null;
  }
  const mediaRow = tokenRow.mediaId ? await getMediaById(tokenRow.mediaId) : null;
  return mediaRow
    ? { target: 'media', targetId: mediaRow.id, title: mediaRow.title, options: getPurchaseOptions(mediaRow, currency) }
    : null;
}

/** A payment the visitor started for the token, as far as their page needs to know. */
export interface OpenPayment {
  period: PurchasePeriod
  /**
   * `open`: not paid yet, to be continued at Mollie. `pending`: being processed,
   * done in a moment. `transfer`: a bank transfer, done once the money arrives.
   */
  status: 'open' | 'pending' | 'transfer'
  /** Whether Mollie's checkout still has something to show, e.g. a bank transfer's details. */
  resumable: boolean
  /**
   * Whether Mollie lets this payment be canceled, which a bank transfer is
   * while the money has not arrived — the way out of waiting days for it.
   */
  cancelable: boolean
}

export interface PurchaseOffer {
  options: PurchaseOption[]
  /** While set, the visitor continues this payment rather than starting another. */
  openPayment: OpenPayment | null
}

const NO_OFFER: PurchaseOffer = { options: [], openPayment: null };

/** `null` for an id Mollie does not know. */
async function fetchPayment(mollie: MollieApi, paymentId: string): Promise<MolliePayment | null> {
  try {
    return await mollie.getPayment(paymentId);
  }
  catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Brings the token in line with what Mollie says about one of its payments:
 * a paid one extends it, one that ended without money is no longer open, and
 * one whose money went back again is taken back. `null` when the payment
 * names a token that is gone.
 */
async function settlePayment(payment: MolliePayment, metadata: PurchaseMetadata): Promise<PurchaseStatus | null> {
  const status = classifyPaymentStatus(payment.status, payment.method ?? null);
  if (status === 'failed') {
    clearOpenPayment(metadata.tokenId, payment.id);
  }
  if (status !== 'paid') {
    return status;
  }
  if (isPaymentReversed(payment)) {
    // Mollie keeps a refunded or charged back payment `paid` and calls the
    // same webhook; a purchase it never applied stays unapplied.
    if (revertTokenPurchase(payment.id) === 'reverted') {
      recordPaymentNotice({ paymentId: payment.id, kind: 'reverted', ...noticeDetails(payment) });
    }
    return 'reversed';
  }
  // The id and the value together: a token deleted and a new one issued with
  // the same value (practically impossible, but cheap to rule out) must not
  // inherit someone else's purchase.
  const tokenRow = await findTokenById(metadata.tokenId);
  if (!tokenRow || tokenRow.token !== metadata.token) {
    // The visitor paid for nothing; the refund is done in Mollie, so the
    // admin is shown the way there.
    console.error(`Paid payment ${payment.id} refers to token ${metadata.tokenId}, which no longer exists.`);
    recordPaymentNotice({ paymentId: payment.id, kind: 'unapplied', ...noticeDetails(payment) });
    return null;
  }
  applyTokenPurchase({
    tokenId: tokenRow.id,
    paymentId: payment.id,
    period: metadata.period,
    amount: toMinorUnits(Number(payment.amount.value), payment.amount.currency),
    currency: payment.amount.currency,
    dashboardUrl: payment._links.dashboard?.href ?? null,
  });
  return 'paid';
}

function noticeDetails(payment: MolliePayment) {
  return { description: payment.description, dashboardUrl: payment._links.dashboard?.href ?? null };
}

interface OpenPaymentState {
  id: string
  status: PurchaseStatus
  period: PurchasePeriod
  checkoutUrl: string | null
  dashboardUrl: string | null
  cancelable: boolean
  /** Started a few minutes ago at most: worth waiting for while it is processed. */
  recent: boolean
}

/**
 * Asks Mollie how the payment the token remembers stands, and settles it.
 * This is what notices an expired or paid payment where no webhook gets
 * through, like a local setup. `null` when the token has none (any longer).
 */
async function refreshOpenPayment(mollie: MollieApi, tokenRow: Token): Promise<OpenPaymentState | null> {
  if (!tokenRow.openPaymentId) {
    return null;
  }
  const payment = await fetchPayment(mollie, tokenRow.openPaymentId);
  const metadata = payment ? parsePurchaseMetadata(payment.metadata) : null;
  if (!payment || !metadata || metadata.tokenId !== tokenRow.id) {
    clearOpenPayment(tokenRow.id, tokenRow.openPaymentId);
    return null;
  }
  const status = await settlePayment(payment, metadata);
  if (!status) {
    return null;
  }
  // After a failed or canceled attempt Mollie's API no longer hands out the
  // checkout link, though the page still lets the visitor try again.
  const checkoutUrl = payment._links.checkout?.href
    ?? (status === 'open' || status === 'transfer' ? tokenRow.openPaymentCheckoutUrl : null);
  return {
    id: payment.id,
    status,
    period: metadata.period,
    checkoutUrl,
    dashboardUrl: payment._links.dashboard?.href ?? null,
    cancelable: !!payment.isCancelable,
    recent: isPaymentRecent(payment.createdAt),
  };
}

function isOngoing(state: OpenPaymentState | null): state is OpenPaymentState & { status: OpenPayment['status'] } {
  return state?.status === 'open' || state?.status === 'pending' || state?.status === 'transfer';
}

/**
 * What the visitor holding this token may buy right now — nothing while
 * purchasing is off, the target has no price, or the token needs no renewal —
 * and the payment they already started, if Mollie still holds it open.
 */
export async function getPurchaseOffer(tokenRow: Token): Promise<PurchaseOffer> {
  const mollie = useMollie();
  if (!mollie || !(await isTokenRenewable(tokenRow))) {
    return NO_OFFER;
  }
  let open: OpenPaymentState | null = null;
  try {
    open = await refreshOpenPayment(mollie, tokenRow);
  }
  catch (error) {
    // Mollie unreachable: the page offers buying as usual, and starting a
    // purchase asks Mollie again before it creates anything.
    console.error(`Failed to look up the open payment of a token:`, error);
  }
  if (open?.status === 'paid') {
    // Just renewed: there is nothing to buy, and the next load shows the content.
    return NO_OFFER;
  }
  const options = (await getPurchaseTarget(tokenRow))?.options ?? [];
  return {
    options,
    openPayment: isOngoing(open)
      ? { period: open.period, status: open.status, resumable: !!open.checkoutUrl, cancelable: open.cancelable }
      : null,
  };
}

/** Mollie cannot reach these, and refuses a webhook URL pointing at them. */
function isLocalOrigin(origin: string): boolean {
  const { hostname } = new URL(origin);
  return hostname === 'localhost' || hostname === '::1' || hostname === '[::1]' || hostname.startsWith('127.');
}

export class PurchaseUnavailableError extends Error {}

/** The token's payment is being processed and Mollie has nothing to continue. */
export class PaymentInProgressError extends Error {}

/**
 * Returns where to send the visitor to pay for renewing a token. While a
 * payment they started is still open, that is its checkout, where they can
 * try again — Mollie keeps a payment open after a failed or canceled attempt,
 * and a second payment could end up paid twice. Otherwise a new payment is
 * created, at the target's price at this moment; the request only names the
 * period.
 */
export async function startPurchase(data: {
  tokenValue: string
  period: PurchasePeriod
  locale: string
  /** The app's public origin, which redirect and webhook URLs are built on. */
  origin: string
}): Promise<{ checkoutUrl: string }> {
  const mollie = useMollie();
  let tokenRow = await findTokenByValue(data.tokenValue);
  if (!mollie || !tokenRow) {
    throw new PurchaseUnavailableError();
  }
  const open = await refreshOpenPayment(mollie, tokenRow);
  if (open?.status === 'paid') {
    tokenRow = await findTokenById(tokenRow.id);
  }
  if (!tokenRow || !(await isTokenRenewable(tokenRow))) {
    throw new PurchaseUnavailableError();
  }
  if (isOngoing(open)) {
    if (!open.checkoutUrl) {
      throw new PaymentInProgressError();
    }
    return { checkoutUrl: open.checkoutUrl };
  }
  const target = await getPurchaseTarget(tokenRow);
  const option = target?.options.find(item => item.period === data.period);
  if (!target || !option) {
    throw new PurchaseUnavailableError();
  }
  const tokenPath = `${data.origin}/${encodeURIComponent(tokenRow.token)}`;
  const metadata: PurchaseMetadata = {
    token: tokenRow.token,
    tokenId: tokenRow.id,
    target: target.target,
    targetId: target.targetId,
    period: data.period,
    adminUrl: `${data.origin}/${target.target === 'group' ? 'groups' : 'media'}/${target.targetId}`,
  };
  const payment = await mollie.createPayment({
    amount: toMollieAmount(option.amount, option.currency),
    description: buildPaymentDescription(target.title, data.period, data.locale),
    // Mollie's redirect says nothing about the payment, and needs not: the
    // token page asks about the token's open payment whenever it loads.
    redirectUrl: tokenPath,
    webhookUrl: isLocalOrigin(data.origin) ? undefined : `${data.origin}/api/payments/webhook`,
    locale: toMollieLocale(data.locale),
    metadata,
  });
  const checkoutUrl = payment._links.checkout?.href;
  if (!checkoutUrl) {
    throw new Error(`Mollie returned no checkout URL for payment ${payment.id}`);
  }
  if (!setOpenPayment(tokenRow.id, payment.id, checkoutUrl)) {
    // A second request for the same token got here first, e.g. from another
    // tab. Both are led to its checkout; the payment created here is shown to
    // nobody and expires at Mollie on its own.
    const winner = (await findTokenById(tokenRow.id))?.openPaymentCheckoutUrl;
    if (!winner) {
      throw new Error(`Token ${tokenRow.id} lost its open payment while another was being started`);
    }
    return { checkoutUrl: winner };
  }
  return { checkoutUrl };
}

/** The token's payment cannot be canceled: there is none, or Mollie does not let this one. */
export class PaymentNotCancelableError extends Error {}

/**
 * Cancels the payment the visitor started, where Mollie allows it — a bank
 * transfer not yet made, above all — so they can pay another way instead of
 * waiting days for it to expire. The token forgets it right away.
 */
export async function cancelOpenPayment(tokenValue: string): Promise<void> {
  const mollie = useMollie();
  const tokenRow = mollie ? await findTokenByValue(tokenValue) : null;
  if (!mollie || !tokenRow) {
    throw new PurchaseUnavailableError();
  }
  const open = await refreshOpenPayment(mollie, tokenRow);
  if (!isOngoing(open) || !open.cancelable) {
    throw new PaymentNotCancelableError();
  }
  await mollie.cancelPayment(open.id);
  clearOpenPayment(tokenRow.id, open.id);
}

export interface TokenPaymentCheck {
  /**
   * `null` when the token has no payment in progress (any longer), e.g.
   * because the webhook already applied it, or when purchasing is off.
   */
  status: PurchaseStatus | null
  /**
   * Whether the page should hold back for this payment: it is being
   * processed and was started a few minutes ago at most. One older than
   * that is taking longer than any page should wait, and the page says so
   * instead of making every visit wait again.
   */
  wait: boolean
  /** The payment in the Mollie dashboard, where an admin can follow it. */
  dashboardUrl: string | null
}

/**
 * How the token's open payment stands, settled the same way the webhook would,
 * so a visitor back from Mollie with a paid one sees the content without
 * waiting for Mollie's call — and so it works where Mollie cannot call at all,
 * like a local setup. Asked whenever the token page loads; without an open
 * payment no call to Mollie is made.
 */
export async function confirmTokenPayment(tokenValue: string): Promise<TokenPaymentCheck> {
  const mollie = useMollie();
  if (!mollie) {
    return { status: null, wait: false, dashboardUrl: null };
  }
  const tokenRow = await findTokenByValue(tokenValue);
  if (!tokenRow) {
    throw new PurchaseUnavailableError();
  }
  const open = await refreshOpenPayment(mollie, tokenRow);
  return {
    status: open?.status ?? null,
    wait: open?.status === 'pending' && open.recent,
    dashboardUrl: open?.dashboardUrl ?? null,
  };
}

/**
 * Looks a payment up at Mollie and settles it: once paid it extends the token
 * it was made for, once over without money the token forgets it. Everything
 * that matters — token, period, status — is read back from Mollie, so the
 * webhook's body cannot claim a payment that did not happen. Safe to call any
 * number of times; an id Mollie does not know, or one this app did not create,
 * changes nothing.
 */
export async function confirmPayment(paymentId: string): Promise<void> {
  const mollie = useMollie();
  if (!mollie) {
    return;
  }
  const payment = await fetchPayment(mollie, paymentId);
  const metadata = payment ? parsePurchaseMetadata(payment.metadata) : null;
  if (payment && metadata) {
    await settlePayment(payment, metadata);
  }
}
