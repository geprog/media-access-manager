/**
 * A stand-in for the Mollie API, so the purchase flow runs end to end without
 * reaching Mollie. The app server talks to it through `NUXT_MOLLIE_API_ENDPOINT`;
 * the browser visits its `/checkout/:id` page instead of Mollie's hosted one.
 *
 * Covers only what the app uses: create, get and cancel a payment. `GET
 * /__payments` lets a test see what the app sent, e.g. the description, and
 * `POST /__payments/:id/:status` changes a payment the way Mollie would on its
 * own, e.g. `expired` — or `chargeback` and `refund`, which keep it `paid`
 * and raise the returned amount, as Mollie does.
 *
 * Run directly with Node, which strips the types: `node e2e/support/mollieStub.ts`.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import process from 'node:process';

const port = Number(process.env.MOLLIE_STUB_PORT) || 3200;
const base = `http://localhost:${port}`;

interface StubPayment {
  resource: 'payment'
  id: string
  mode: 'test'
  status: string
  method: string | null
  amount: { currency: string, value: string }
  amountRefunded?: { currency: string, value: string }
  amountChargedBack?: { currency: string, value: string }
  isCancelable: boolean
  description: string
  redirectUrl: string
  webhookUrl?: string
  locale?: string
  metadata: unknown
  createdAt: string
  _links: Record<string, { href: string, type: string }>
}

const payments = new Map<string, StubPayment>();

async function readJson(request: IncomingMessage): Promise<Record<string, any>> {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
  }
  return raw ? JSON.parse(raw) : {};
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/hal+json' });
  response.end(JSON.stringify(body));
}

function notFound(response: ServerResponse) {
  send(response, 404, { status: 404, title: 'Not Found', detail: 'No payment exists with token.' });
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', base);
  const [, first, second, id, action] = url.pathname.split('/');

  if (url.pathname === '/__payments') {
    return send(response, 200, [...payments.values()]);
  }
  // What Mollie does without the customer on its checkout: process a payment
  // (`pending`), complete it (`paid`), or let it expire (`expired`).
  if (first === '__payments' && second && id && request.method === 'POST') {
    const payment = payments.get(second);
    if (!payment) {
      return notFound(response);
    }
    if (id === 'chargeback' || id === 'refund') {
      payment[id === 'chargeback' ? 'amountChargedBack' : 'amountRefunded'] = { ...payment.amount };
      return send(response, 200, payment);
    }
    payment.status = id;
    if (id !== 'open') {
      delete payment._links.checkout;
      payment.isCancelable = false;
    }
    return send(response, 200, payment);
  }

  // Mollie's hosted checkout, reduced to the outcomes a test needs. "Back" is
  // Mollie's link back to the shop, which leaves the payment open.
  if (first === 'checkout' && second) {
    const payment = payments.get(second);
    if (!payment) {
      return notFound(response);
    }
    if (request.method === 'POST' && id) {
      if (id === 'pay') {
        Object.assign(payment, { status: 'paid', method: 'creditcard' });
      }
      else if (id === 'cancel') {
        payment.status = 'canceled';
      }
      else if (id === 'transfer') {
        // A bank transfer: open until the money arrives, days later, and
        // cancelable by the merchant until then. The checkout keeps showing
        // the transfer details.
        Object.assign(payment, { method: 'banktransfer', isCancelable: true });
      }
      else {
        // Like Mollie after a failed attempt: still open, but the API no longer
        // hands out the checkout link — the page itself keeps working.
        payment.method = 'paypal';
        delete payment._links.checkout;
      }
      response.writeHead(303, { location: payment.redirectUrl });
      return response.end();
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(`<!doctype html><h1>${payment.description}</h1>
      <p>${payment.amount.value} ${payment.amount.currency}</p>
      <form method="post" action="/checkout/${payment.id}/pay"><button>Pay</button></form>
      <form method="post" action="/checkout/${payment.id}/cancel"><button>Cancel</button></form>
      <form method="post" action="/checkout/${payment.id}/transfer"><button>Bank transfer</button></form>
      <form method="post" action="/checkout/${payment.id}/back"><button>Back</button></form>`);
  }

  if (first !== 'v2' || second !== 'payments' || action) {
    return notFound(response);
  }
  if (request.method === 'POST' && !id) {
    const body = await readJson(request);
    const paymentId = `tr_${randomBytes(5).toString('hex')}`;
    const payment: StubPayment = {
      resource: 'payment',
      id: paymentId,
      mode: 'test',
      status: 'open',
      method: null,
      amount: body.amount,
      isCancelable: false,
      description: body.description,
      redirectUrl: body.redirectUrl,
      webhookUrl: body.webhookUrl,
      locale: body.locale,
      metadata: body.metadata ?? null,
      createdAt: new Date().toISOString(),
      _links: {
        self: { href: `${base}/v2/payments/${paymentId}`, type: 'application/hal+json' },
        checkout: { href: `${base}/checkout/${paymentId}`, type: 'text/html' },
        dashboard: { href: `${base}/dashboard/payments/${paymentId}`, type: 'text/html' },
      },
    };
    payments.set(paymentId, payment);
    return send(response, 201, payment);
  }
  const payment = id ? payments.get(id) : undefined;
  if (!payment) {
    return notFound(response);
  }
  if (request.method === 'DELETE') {
    // Mollie only cancels what it reported cancelable.
    if (!payment.isCancelable) {
      return send(response, 422, { status: 422, title: 'Unprocessable Entity', detail: 'This payment cannot be canceled.' });
    }
    Object.assign(payment, { status: 'canceled', isCancelable: false });
    delete payment._links.checkout;
    return send(response, 200, payment);
  }
  return send(response, 200, payment);
}).listen(port, () => {
  process.stdout.write(`Mollie stub listening on ${base}\n`);
});
