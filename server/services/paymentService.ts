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
import { applyTokenPurchase, findTokenById, findTokenByValue, isTokenRenewable } from './tokenService';

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

/**
 * What the visitor holding this token may buy right now — nothing while
 * purchasing is off, the target has no price, or the token needs no renewal.
 */
export async function getPurchaseOptionsForToken(tokenRow: Token): Promise<PurchaseOption[]> {
  if (!isPurchasingEnabled() || !(await isTokenRenewable(tokenRow))) {
    return [];
  }
  return (await getPurchaseTarget(tokenRow))?.options ?? [];
}

/** Mollie cannot reach these, and refuses a webhook URL pointing at them. */
function isLocalOrigin(origin: string): boolean {
  const { hostname } = new URL(origin);
  return hostname === 'localhost' || hostname === '::1' || hostname === '[::1]' || hostname.startsWith('127.');
}

export class PurchaseUnavailableError extends Error {}

/**
 * Creates the Mollie payment for renewing a token and returns where to send
 * the visitor to pay. The amount comes from the target's price at this moment;
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
  const tokenRow = await findTokenByValue(data.tokenValue);
  if (!mollie || !tokenRow || !(await isTokenRenewable(tokenRow))) {
    throw new PurchaseUnavailableError();
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
  // token and the webhook extends it — only the instant confirmation is lost.
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
  return { checkoutUrl };
}

/**
 * Looks a payment up at Mollie and, once it is paid, extends the token it was
 * made for. Everything that matters — token, period, status — is read back from
 * Mollie, so neither the webhook's body nor the visitor's URL can claim a
 * payment that did not happen. Safe to call any number of times.
 *
 * `null` means the payment is unknown or none of this app's business, e.g. it
 * belongs to another token than `expectedToken`.
 */
export async function confirmPayment(paymentId: string, expectedToken?: string): Promise<PurchaseStatus | null> {
  const mollie = useMollie();
  if (!mollie) {
    return null;
  }
  let payment: MolliePayment;
  try {
    payment = await mollie.getPayment(paymentId);
  }
  catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      return null;
    }
    throw error;
  }
  const metadata = parsePurchaseMetadata(payment.metadata);
  if (!metadata || (expectedToken !== undefined && metadata.token !== expectedToken)) {
    return null;
  }
  const status = classifyPaymentStatus(payment.status);
  if (status !== 'paid') {
    return status;
  }
  // The id and the value together: a token deleted and a new one issued with
  // the same value (practically impossible, but cheap to rule out) must not
  // inherit someone else's purchase.
  const tokenRow = await findTokenById(metadata.tokenId);
  if (!tokenRow || tokenRow.token !== metadata.token) {
    console.error(`Paid payment ${paymentId} refers to token ${metadata.tokenId}, which no longer exists.`);
    return null;
  }
  applyTokenPurchase({ tokenId: tokenRow.id, paymentId: payment.id, period: metadata.period });
  return 'paid';
}
