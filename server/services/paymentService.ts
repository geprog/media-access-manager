import type { Token } from '../db/schema';
import type { MollieApi, MolliePayment } from '../utils/mollieApi';
import type { PurchaseMetadata, PurchaseOption, PurchasePeriod, PurchaseStatus } from '../utils/purchase';
import { toMollieAmount } from '../../utils/money';
import { createMollieApi } from '../utils/mollieApi';
import {
  buildPaymentDescription,
  classifyPaymentStatus,
  getPurchaseOptions,
  parsePurchaseMetadata,
  toMollieLocale,
} from '../utils/purchase';
import { getMediaGroupById } from './mediaGroupService';
import { getMediaById } from './mediaService';
import {
  applyTokenPurchase,
  clearOpenPayment,
  findTokenById,
  findTokenByValue,
  isTokenRenewable,
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
  /** `open`: not paid yet, to be continued at Mollie. `pending`: the money is on its way. */
  status: 'open' | 'pending'
  /** Whether Mollie's checkout still has something to show, e.g. a bank transfer's details. */
  resumable: boolean
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
 * a paid one extends it, one that ended without money is no longer open.
 * `null` when the payment names a token that is gone.
 */
async function settlePayment(payment: MolliePayment, metadata: PurchaseMetadata): Promise<PurchaseStatus | null> {
  const status = classifyPaymentStatus(payment.status, payment.method ?? null);
  if (status === 'failed') {
    clearOpenPayment(metadata.tokenId, payment.id);
  }
  if (status !== 'paid') {
    return status;
  }
  // The id and the value together: a token deleted and a new one issued with
  // the same value (practically impossible, but cheap to rule out) must not
  // inherit someone else's purchase.
  const tokenRow = await findTokenById(metadata.tokenId);
  if (!tokenRow || tokenRow.token !== metadata.token) {
    console.error(`Paid payment ${payment.id} refers to token ${metadata.tokenId}, which no longer exists.`);
    return null;
  }
  applyTokenPurchase({ tokenId: tokenRow.id, paymentId: payment.id, period: metadata.period });
  return 'paid';
}

interface OpenPaymentState {
  status: PurchaseStatus
  period: PurchasePeriod
  checkoutUrl: string | null
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
    ?? (status === 'open' ? tokenRow.openPaymentCheckoutUrl : null);
  return { status, period: metadata.period, checkoutUrl };
}

function isOngoing(state: OpenPaymentState | null): state is OpenPaymentState & { status: OpenPayment['status'] } {
  return state?.status === 'open' || state?.status === 'pending';
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
    openPayment: isOngoing(open) ? { period: open.period, status: open.status, resumable: !!open.checkoutUrl } : null,
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
    redirectUrl: tokenPath,
    webhookUrl: isLocalOrigin(data.origin) ? undefined : `${data.origin}/api/payments/webhook`,
    locale: toMollieLocale(data.locale),
    metadata,
  });
  // Mollie's redirect carries no payment id, so it is written into the URL
  // once the id exists. Should that fail, the visitor still returns to their
  // token, which knows its open payment (stored below) and asks Mollie about it.
  try {
    await mollie.updatePayment(payment.id, { redirectUrl: `${tokenPath}?payment=${payment.id}` });
  }
  catch (error) {
    console.error(`Failed to add the payment id to the redirect of ${payment.id}:`, error);
  }
  const checkoutUrl = payment._links.checkout?.href;
  if (!checkoutUrl) {
    throw new Error(`Mollie returned no checkout URL for payment ${payment.id}`);
  }
  setOpenPayment(tokenRow.id, payment.id, checkoutUrl);
  return { checkoutUrl };
}

/**
 * Looks a payment up at Mollie and settles it: once paid it extends the token
 * it was made for, once over without money the token forgets it. Everything
 * that matters — token, period, status — is read back from Mollie, so neither
 * the webhook's body nor the visitor's URL can claim a payment that did not
 * happen. Safe to call any number of times.
 *
 * `null` means the payment is unknown or none of this app's business, e.g. it
 * belongs to another token than `expectedToken`.
 */
export async function confirmPayment(paymentId: string, expectedToken?: string): Promise<PurchaseStatus | null> {
  const mollie = useMollie();
  if (!mollie) {
    return null;
  }
  const payment = await fetchPayment(mollie, paymentId);
  const metadata = payment ? parsePurchaseMetadata(payment.metadata) : null;
  if (!payment || !metadata || (expectedToken !== undefined && metadata.token !== expectedToken)) {
    return null;
  }
  return settlePayment(payment, metadata);
}
