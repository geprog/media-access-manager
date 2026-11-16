import type { Token } from '../db/schema';
import type { MollieApi, MolliePayment } from '../utils/mollieApi';
import type { PurchaseMetadata, PurchaseOption, PurchasePeriod, PurchaseStatus } from '../utils/purchase';
import { toMinorUnits, toMollieAmount } from '../../utils/money';
import { createMollieApi } from '../utils/mollieApi';
import { getMollieSettings, getPaymentCurrency, loadLocaleMessages } from '../utils/paymentSettings';
import {
  buildPaymentDescription,
  classifyPaymentStatus,
  describePurchasePeriod,
  getPurchaseOptions,
  isPaymentRecent,
  isPaymentReversed,
  isPaymentUnattempted,
  parsePurchaseMetadata,
  toMollieLocale,
} from '../utils/purchase';
import { getMediaGroupById } from './mediaGroupService';
import { getMediaById } from './mediaService';
import { isPaymentUnapplied, recordPaymentNotice } from './paymentNoticeService';
import {
  applyTokenPurchase,
  clearOpenPayment,
  findTokenById,
  findTokenByValue,
  hasTokenPurchase,
  isTokenRenewable,
  parkOpenPayment,
  revertTokenPurchase,
  setOpenPayment,
  swapOpenPayment,
} from './tokenService';

let client: MollieApi | null = null;

/** `null` while no API key is configured, which switches purchasing off. */
function useMollie(): MollieApi | null {
  const { apiKey, apiEndpoint } = getMollieSettings();
  if (!apiKey) {
    return null;
  }
  client ??= createMollieApi({ apiKey, apiEndpoint });
  return client;
}

export function isPurchasingEnabled(): boolean {
  return !!getMollieSettings().apiKey;
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
  const currency = getPaymentCurrency();
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
  /**
   * Whether picking a different period starts a fresh payment instead of
   * leading back to this one. True while nobody has tried to pay it, so a
   * visitor who clicked the wrong price is not held to it until Mollie lets
   * it expire.
   */
  replaceable: boolean
}

export interface PurchaseOffer {
  options: PurchaseOption[]
  /** While set, the visitor continues this payment rather than starting another. */
  openPayment: OpenPayment | null
}

const NO_OFFER: PurchaseOffer = { options: [], openPayment: null };

/**
 * Payments as Mollie last described them, for a moment. The token page asks
 * about its payment first and then loads the token, which describes the same
 * payment again: the second look-up takes the first one's answer instead of
 * holding the page for another call to Mollie.
 */
const RECENT_LOOKUP_MS = 10_000;
const recentLookups = new Map<string, { payment: MolliePayment, at: number }>();

function rememberLookup(payment: MolliePayment) {
  const now = Date.now();
  for (const [id, entry] of recentLookups) {
    if (now - entry.at > RECENT_LOOKUP_MS) {
      recentLookups.delete(id);
    }
  }
  recentLookups.set(payment.id, { payment, at: now });
}

/**
 * `null` for an id Mollie does not know. `reuseRecent` takes a look-up made a
 * moment ago instead of asking Mollie again — only for showing the payment;
 * whatever acts on it asks Mollie.
 */
async function fetchPayment(
  mollie: MollieApi,
  paymentId: string,
  { reuseRecent = false }: { reuseRecent?: boolean } = {},
): Promise<MolliePayment | null> {
  const recent = recentLookups.get(paymentId);
  if (reuseRecent && recent && Date.now() - recent.at <= RECENT_LOOKUP_MS) {
    return recent.payment;
  }
  try {
    const payment = await mollie.getPayment(paymentId);
    rememberLookup(payment);
    return payment;
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
 * bought nothing: it names a token that is gone, or one that needed no
 * renewal any more by the time the money arrived.
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
    const reversal = revertTokenPurchase(payment.id);
    if (reversal === 'reverted' || reversal === 'superseded') {
      // Told either way: the money is gone whether the access it bought was
      // still standing or a later purchase had replaced it.
      recordPaymentNotice({ paymentId: payment.id, kind: 'reverted', ...noticeDetails(payment) });
    }
    // Nothing is left to pay or to wait for; a token still pointing here
    // would lead every further purchase back to this payment.
    clearOpenPayment(metadata.tokenId, payment.id);
    return 'reversed';
  }
  if (hasTokenPurchase(payment.id)) {
    // Mollie calls again for a payment already applied, e.g. on a partial
    // refund. The token may have changed in any way since.
    return 'paid';
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
  if (isPaymentUnapplied(payment.id) || !(await isTokenRenewable(tokenRow))) {
    // The token got its access back some other way while this payment was
    // open: by a second payment — one the visitor replaced stays payable at
    // Mollie — or by an admin. Applying this one too would cut that access
    // down to this period, and two purchases stacked on each other are what
    // a payer charging both back could keep access through. It buys nothing
    // and is the admin's to refund — for good, also once the token runs out
    // again.
    console.error(`Paid payment ${payment.id} refers to token ${metadata.tokenId}, which needs no renewal.`);
    clearOpenPayment(tokenRow.id, payment.id);
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
  /** `null` while the visitor picked none at Mollie's checkout. */
  method: string | null
  cancelable: boolean
  /** Started a few minutes ago at most: worth waiting for while it is processed. */
  recent: boolean
}

/**
 * Asks Mollie how the payment the token remembers stands, and settles it.
 * This is what notices an expired or paid payment where no webhook gets
 * through, like a local setup. `null` when the token has none (any longer).
 */
async function refreshOpenPayment(
  mollie: MollieApi,
  tokenRow: Token,
  options: { reuseRecent?: boolean } = {},
): Promise<OpenPaymentState | null> {
  return refreshPayment(mollie, tokenRow, tokenRow.openPaymentId, tokenRow.openPaymentCheckoutUrl, options);
}

/** The payment the visitor set aside for the other period, refreshed the same way. */
async function refreshParkedPayment(
  mollie: MollieApi,
  tokenRow: Token,
  options: { reuseRecent?: boolean } = {},
): Promise<OpenPaymentState | null> {
  return refreshPayment(mollie, tokenRow, tokenRow.parkedPaymentId, tokenRow.parkedPaymentCheckoutUrl, options);
}

/**
 * Both payments the token may hold, the open one and the one set aside,
 * brought up to date. Either may have been paid after all.
 */
async function refreshPayments(
  mollie: MollieApi,
  tokenRow: Token,
  options: { reuseRecent?: boolean } = {},
): Promise<{ open: OpenPaymentState | null, parked: OpenPaymentState | null }> {
  const open = await refreshOpenPayment(mollie, tokenRow, options);
  const parked = await refreshParkedPayment(mollie, tokenRow, options);
  return { open, parked };
}

function isPaid(state: OpenPaymentState | null): boolean {
  return state?.status === 'paid';
}

async function refreshPayment(
  mollie: MollieApi,
  tokenRow: Token,
  paymentId: string | null,
  storedCheckoutUrl: string | null,
  options: { reuseRecent?: boolean } = {},
): Promise<OpenPaymentState | null> {
  if (!paymentId) {
    return null;
  }
  const payment = await fetchPayment(mollie, paymentId, options);
  const metadata = payment ? parsePurchaseMetadata(payment.metadata) : null;
  if (!payment || !metadata || metadata.tokenId !== tokenRow.id) {
    clearOpenPayment(tokenRow.id, paymentId);
    return null;
  }
  const status = await settlePayment(payment, metadata);
  if (!status) {
    return null;
  }
  // After a failed or canceled attempt Mollie's API no longer hands out the
  // checkout link, though the page still lets the visitor try again.
  const checkoutUrl = payment._links.checkout?.href
    ?? (status === 'open' || status === 'transfer' ? storedCheckoutUrl : null);
  return {
    id: payment.id,
    status,
    period: metadata.period,
    checkoutUrl,
    dashboardUrl: payment._links.dashboard?.href ?? null,
    method: payment.method ?? null,
    cancelable: !!payment.isCancelable,
    recent: isPaymentRecent(pendingSince(payment, status)),
  };
}

/**
 * When each payment was first seen being processed. Mollie dates a payment's
 * creation, not the moment the customer paid, and a PayPal or Klarna checkout
 * may be left open for hours before that: counted from creation, a payment
 * made after a long pause would look old the moment it is pending, and the
 * page would not wait for it. Kept in memory: after a restart a long-pending
 * payment is waited for once more, which is what every visit did before.
 */
const firstSeenPending = new Map<string, number>();

function pendingSince(payment: MolliePayment, status: PurchaseStatus): Date {
  if (status !== 'pending') {
    firstSeenPending.delete(payment.id);
    return new Date(payment.createdAt);
  }
  const seen = firstSeenPending.get(payment.id) ?? Date.now();
  firstSeenPending.set(payment.id, seen);
  const created = new Date(payment.createdAt).getTime();
  return new Date(Number.isNaN(created) ? seen : Math.max(seen, created));
}

type OngoingPayment = OpenPaymentState & { status: OpenPayment['status'] };

function isOngoing(state: OpenPaymentState | null): state is OngoingPayment {
  return state?.status === 'open' || state?.status === 'pending' || state?.status === 'transfer';
}

/**
 * Whether somebody has tried to pay this payment: a method was picked at
 * Mollie, so money may be on its way. Such a payment is gone on with
 * whichever slot it sits in, and nothing is started beside it.
 */
function isAttempted(state: OpenPaymentState): boolean {
  return !isPaymentUnattempted(state.status, state.method);
}

/**
 * The payment the visitor's page is about, of the two the token may hold: one
 * somebody has tried to pay, in either slot — the one set aside may have been
 * paid from the browser history while the open one still waits for a method —
 * and otherwise the open one. One set aside that nobody tried to pay stands in
 * the way of nothing; it is only led back to when its period is asked for.
 */
function paymentInProgress(open: OpenPaymentState | null, parked: OpenPaymentState | null): OngoingPayment | null {
  const ongoing = [open, parked].filter(isOngoing);
  return ongoing.find(isAttempted) ?? (isOngoing(open) ? open : null);
}

/**
 * What the visitor holding this token may buy right now — nothing while
 * purchasing is off, the target has no price, or the token needs no renewal —
 * and the payment they already started, if Mollie still holds it open.
 * `renewable` is for a caller that already knows, e.g. from the group access
 * it worked out; otherwise it is looked up.
 */
export async function getPurchaseOffer(tokenRow: Token, renewable?: boolean): Promise<PurchaseOffer> {
  const mollie = useMollie();
  if (!mollie || !(renewable ?? await isTokenRenewable(tokenRow))) {
    return NO_OFFER;
  }
  let open: OpenPaymentState | null = null;
  let parked: OpenPaymentState | null = null;
  try {
    // The page asked about these payments a moment ago, before it loaded.
    ({ open, parked } = await refreshPayments(mollie, tokenRow, { reuseRecent: true }));
  }
  catch (error) {
    // Mollie unreachable: the page offers buying as usual, and starting a
    // purchase asks Mollie again before it creates anything.
    console.error(`Failed to look up the open payment of a token:`, error);
  }
  if (isPaid(open) || isPaid(parked)) {
    // Just renewed: there is nothing to buy, and the next load shows the content.
    return NO_OFFER;
  }
  const options = (await getPurchaseTarget(tokenRow))?.options ?? [];
  const current = paymentInProgress(open, parked);
  return {
    options,
    openPayment: current
      ? {
          period: current.period,
          status: current.status,
          resumable: !!current.checkoutUrl,
          cancelable: current.cancelable,
          replaceable: !isAttempted(current),
        }
      : null,
  };
}

/** The bought period as the checkout shows it, in the visitor's language. */
async function describePeriodIn(period: PurchasePeriod, locale: string): Promise<string> {
  const [messages, fallback] = await Promise.all([loadLocaleMessages(locale), loadLocaleMessages('en')]);
  return describePurchasePeriod(period, messages, fallback);
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
 * Sets aside the payment a visitor replaced with one for another period.
 * Mollie refuses to cancel a payment nobody has tried to pay, so it stays
 * payable until Mollie expires it; the token keeps it aside, and asking for
 * its period again leads back to it rather than creating yet another payment.
 * Paid after all it still extends their token, unless the payment that
 * replaced it did so first: then it is shown to the admin to refund. One
 * Mollie does let cancel is canceled and forgotten.
 */
async function setOpenPaymentAside(mollie: MollieApi, tokenId: string, open: OpenPaymentState): Promise<void> {
  if (!open.cancelable) {
    parkOpenPayment(tokenId, open.id);
    return;
  }
  try {
    await mollie.cancelPayment(open.id);
  }
  catch (error) {
    console.error(`Failed to cancel the replaced payment ${open.id}:`, error);
  }
  clearOpenPayment(tokenId, open.id);
}

/** Where a payment still in progress is continued; none left to show means it is being processed. */
function continuePayment(state: OpenPaymentState): { checkoutUrl: string } {
  if (!state.checkoutUrl) {
    throw new PaymentInProgressError();
  }
  return { checkoutUrl: state.checkoutUrl };
}

/**
 * Where a request that lost a race is sent: a second request for the same
 * token got its payment remembered first, e.g. from another tab, and both are
 * led to that one. A payment created by the loser is shown to nobody and
 * expires at Mollie on its own.
 */
async function leadToOpenPayment(tokenId: string): Promise<{ checkoutUrl: string }> {
  const checkoutUrl = (await findTokenById(tokenId))?.openPaymentCheckoutUrl;
  if (!checkoutUrl) {
    throw new Error(`Token ${tokenId} lost its open payment while another was being started`);
  }
  return { checkoutUrl };
}

/**
 * Returns where to send the visitor to pay for renewing a token. While a
 * payment they started is still open, that is its checkout, where they can
 * try again — Mollie keeps a payment open after a failed or canceled attempt,
 * and a second payment could end up paid twice. Asking for another period
 * than that payment is for is the one case that replaces it, and only while
 * nobody has tried to pay it: a visitor who picked the wrong price, left
 * Mollie's method list and came back is not held to it until it expires.
 * The replaced payment is set aside, and asking for its period again leads
 * back to it — also once the payment that replaced it is gone. Once a method
 * was picked for it from the browser history, that attempt may still go
 * through, and it is the one gone on with whatever period is asked for.
 * Switching to and fro thus creates no more than one payment per period.
 * Otherwise a new payment is created, at the target's price at this moment;
 * the request only names the period.
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
  const { open, parked } = await refreshPayments(mollie, tokenRow);
  if (isPaid(open) || isPaid(parked)) {
    // Paid after all, perhaps from the browser history: the token was renewed
    // by it just now, and there is nothing left to buy.
    tokenRow = await findTokenById(tokenRow.id);
  }
  if (!tokenRow || !(await isTokenRenewable(tokenRow))) {
    throw new PurchaseUnavailableError();
  }
  // One somebody has tried to pay, in either slot, is the one to go on with:
  // a second payment beside it could have the visitor pay twice. Otherwise
  // the one for this period, open or set aside — asking for another period
  // than the open one is for replaces it, as nobody has tried to pay it.
  const ongoing = [open, parked].filter(isOngoing);
  const continued = ongoing.find(isAttempted) ?? ongoing.find(state => state.period === data.period);
  if (continued) {
    const checkout = continuePayment(continued);
    // The one set aside takes the open one's place — or the empty place,
    // once the payment that replaced it is gone.
    if (continued.id !== open?.id && !swapOpenPayment(tokenRow.id, isOngoing(open) ? open.id : null, continued.id)) {
      return leadToOpenPayment(tokenRow.id);
    }
    return checkout;
  }
  if (isOngoing(open)) {
    await setOpenPaymentAside(mollie, tokenRow.id, open);
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
    description: buildPaymentDescription(target.title, await describePeriodIn(data.period, data.locale)),
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
    return leadToOpenPayment(tokenRow.id);
  }
  return { checkoutUrl };
}

/** The token's payment cannot be canceled: there is none, or Mollie does not let this one. */
export class PaymentNotCancelableError extends Error {}

/**
 * Cancels the payment the visitor's page is about, where Mollie allows it — a
 * bank transfer not yet made, above all — so they can pay another way instead
 * of waiting days for it to expire. The token forgets it right away.
 */
export async function cancelOpenPayment(tokenValue: string): Promise<void> {
  const mollie = useMollie();
  const tokenRow = mollie ? await findTokenByValue(tokenValue) : null;
  if (!mollie || !tokenRow) {
    throw new PurchaseUnavailableError();
  }
  const { open, parked } = await refreshPayments(mollie, tokenRow);
  const current = paymentInProgress(open, parked);
  if (!current?.cancelable) {
    throw new PaymentNotCancelableError();
  }
  await mollie.cancelPayment(current.id);
  recentLookups.delete(current.id);
  clearOpenPayment(tokenRow.id, current.id);
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
  const { open, parked } = await refreshPayments(mollie, tokenRow);
  // A paid one, if either is: the token was just renewed. Otherwise the one
  // in progress, and failing that whatever is left to report, e.g. a failed one.
  const current = [open, parked].find(isPaid) ?? paymentInProgress(open, parked) ?? open ?? parked;
  return {
    status: current?.status ?? null,
    wait: current?.status === 'pending' && current.recent,
    dashboardUrl: current?.dashboardUrl ?? null,
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
