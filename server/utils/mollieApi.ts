/**
 * The three calls of Mollie's Payments API this app makes, over Nuxt's own
 * `$fetch`. Mollie's SDK would add a legacy HTTP client for them and insists
 * on `https:`, which rules out the local stand-in the end-to-end tests use.
 *
 * @see https://docs.mollie.com/reference/payments-api
 */

const MOLLIE_API = 'https://api.mollie.com/v2/';

/**
 * Mollie answers in well under a second. The token page asks about an open
 * payment on every load, so a hanging connection must not hang the page.
 */
const MOLLIE_TIMEOUT_MS = 10_000;

export interface MollieAmount {
  currency: string
  /** A decimal string such as `"9.00"`. */
  value: string
}

/** As much of a Mollie payment as this app reads. */
export interface MolliePayment {
  id: string
  /** `open`, `pending`, `authorized`, `paid`, `canceled`, `expired` or `failed`. */
  status: string
  /** `null` until the customer picked one on the checkout. */
  method: string | null
  amount: MollieAmount
  /** Only present once something was refunded or charged back. */
  amountRefunded?: MollieAmount
  amountChargedBack?: MollieAmount
  /** ISO 8601, when the payment was created. */
  createdAt: string
  /** Whether Mollie lets the merchant cancel this payment right now. */
  isCancelable?: boolean
  description: string
  metadata: unknown
  _links: {
    checkout?: { href: string }
    /** The payment in the Mollie dashboard, for the account's own people only. */
    dashboard?: { href: string }
  }
}

export interface CreatePaymentBody {
  amount: MollieAmount
  description: string
  redirectUrl: string
  webhookUrl?: string
  locale?: string
  metadata: unknown
}

export function createMollieApi(options: { apiKey: string, apiEndpoint?: string }) {
  const api = $fetch.create({
    baseURL: options.apiEndpoint || MOLLIE_API,
    headers: { Authorization: `Bearer ${options.apiKey}` },
    timeout: MOLLIE_TIMEOUT_MS,
  });
  const paymentPath = (id: string) => `payments/${encodeURIComponent(id)}`;
  return {
    createPayment: (body: CreatePaymentBody) =>
      api<MolliePayment>('payments', { method: 'POST', body }),
    getPayment: (id: string) =>
      api<MolliePayment>(paymentPath(id)),
    /** Only for a payment whose `isCancelable` is set; Mollie refuses the rest. */
    cancelPayment: (id: string) =>
      api<MolliePayment>(paymentPath(id), { method: 'DELETE' }),
  };
}

export type MollieApi = ReturnType<typeof createMollieApi>;
