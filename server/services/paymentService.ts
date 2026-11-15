import type { Token } from '../db/schema';
import type { MollieApi, MolliePayment } from '../utils/mollieApi';
import type { LocaleMessages, PurchaseMetadata, PurchaseOption, PurchasePeriod, PurchaseStatus } from '../utils/purchase';
import { toMinorUnits, toMollieAmount } from '../../utils/money';
import { createMollieApi } from '../utils/mollieApi';
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
    if (revertTokenPurchase(payment.id) === 'reverted') {
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
async function refreshParkedPayment(mollie: MollieApi, tokenRow: Token): Promise<OpenPaymentState | null> {
  return refreshPayment(mollie, tokenRow, tokenRow.parkedPaymentId, tokenRow.parkedPaymentCheckoutUrl);
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
 * `renewable` is for a caller that already knows, e.g. from the group access
 * it worked out; otherwise it is looked up.
 */
export async function getPurchaseOffer(tokenRow: Token, renewable?: boolean): Promise<PurchaseOffer> {
  const mollie = useMollie();
  if (!mollie || !(renewable ?? await isTokenRenewable(tokenRow))) {
    return NO_OFFER;
  }
  let open: OpenPaymentState | null = null;
  try {
    // The page asked about this payment a moment ago, before it loaded.
    open = await refreshOpenPayment(mollie, tokenRow, { reuseRecent: true });
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
      ? {
          period: open.period,
          status: open.status,
          resumable: !!open.checkoutUrl,
          cancelable: open.cancelable,
          replaceable: isPaymentUnattempted(open.status, open.method),
        }
      : null,
  };
}

/** Only plain language codes: the code comes from the request and names a file. */
const LOCALE_CODE = /^[a-z]{2,3}(?:-[a-z]{2,4})?$/i;

/** The app's translations for a language, `null` for one it lacks. */
async function loadLocaleMessages(locale: string): Promise<LocaleMessages> {
  if (!LOCALE_CODE.test(locale)) {
    return null;
  }
  return useStorage('assets:locales').getItem<Record<string, unknown>>(`${locale}.json`);
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

/**
 * Whether the payment set aside can be continued for this period the way the
 * open one is replaced: nobody has tried to pay it and its checkout is known.
 */
function isContinuable(
  parked: OpenPaymentState | null,
  period: PurchasePeriod,
): parked is OpenPaymentState & { checkoutUrl: string } {
  return !!parked
    && parked.period === period
    && isPaymentUnattempted(parked.status, parked.method)
    && !!parked.checkoutUrl;
}

/**
 * Returns where to send the visitor to pay for renewing a token. While a
 * payment they started is still open, that is its checkout, where they can
 * try again — Mollie keeps a payment open after a failed or canceled attempt,
 * and a second payment could end up paid twice. Asking for another period
 * than that payment is for is the one case that replaces it, and only while
 * nobody has tried to pay it: a visitor who picked the wrong price, left
 * Mollie's method list and came back is not held to it until it expires.
 * The replaced payment is set aside, and switching back leads to it again, so
 * switching to and fro creates no more than one payment per period.
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
  const open = await refreshOpenPayment(mollie, tokenRow);
  if (open?.status === 'paid') {
    tokenRow = await findTokenById(tokenRow.id);
  }
  if (!tokenRow || !(await isTokenRenewable(tokenRow))) {
    throw new PurchaseUnavailableError();
  }
  if (isOngoing(open)) {
    // Asking for the period they began leads back to that payment; asking for
    // another one replaces it, as long as nobody has tried to pay it.
    if (open.period === data.period || !isPaymentUnattempted(open.status, open.method)) {
      if (!open.checkoutUrl) {
        throw new PaymentInProgressError();
      }
      return { checkoutUrl: open.checkoutUrl };
    }
    const parked = await refreshParkedPayment(mollie, tokenRow);
    if (parked?.status === 'paid') {
      // Paid from the visitor's browser history after all: the token was
      // renewed by it just now, and there is nothing left to buy.
      throw new PurchaseUnavailableError();
    }
    if (isContinuable(parked, data.period) && swapOpenPayment(tokenRow.id, open.id, parked.id)) {
      return { checkoutUrl: parked.checkoutUrl };
    }
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
  recentLookups.delete(open.id);
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
