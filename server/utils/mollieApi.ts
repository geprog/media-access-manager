/**
 * The three calls of Mollie's Payments API this app makes, over Nuxt's own
 * `$fetch`. Mollie's SDK would add a legacy HTTP client for them and insists
 * on `https:`, which rules out the local stand-in the end-to-end tests use.
 *
 * @see https://docs.mollie.com/reference/payments-api
 */

const MOLLIE_API = 'https://api.mollie.com/v2/';

/** As much of a Mollie payment as this app reads. */
export interface MolliePayment {
  id: string
  /** `open`, `pending`, `authorized`, `paid`, `canceled`, `expired` or `failed`. */
  status: string
  metadata: unknown
  _links: {
    checkout?: { href: string }
  }
}

export interface CreatePaymentBody {
  amount: { currency: string, value: string }
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
  });
  const paymentPath = (id: string) => `payments/${encodeURIComponent(id)}`;
  return {
    createPayment: (body: CreatePaymentBody) =>
      api<MolliePayment>('payments', { method: 'POST', body }),
    updatePayment: (id: string, body: { redirectUrl: string }) =>
      api<MolliePayment>(paymentPath(id), { method: 'PATCH', body }),
    getPayment: (id: string) =>
      api<MolliePayment>(paymentPath(id)),
  };
}

export type MollieApi = ReturnType<typeof createMollieApi>;
