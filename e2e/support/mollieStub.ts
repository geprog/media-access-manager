/**
 * A stand-in for the Mollie API, so the purchase flow runs end to end without
 * reaching Mollie. The app server talks to it through `NUXT_MOLLIE_API_ENDPOINT`;
 * the browser visits its `/checkout/:id` page instead of Mollie's hosted one.
 *
 * Covers only what the app uses: create, update and get a payment. `GET
 * /__payments` lets a test see what the app sent, e.g. the description.
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
  amount: { currency: string, value: string }
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

  // Mollie's hosted checkout, reduced to the two outcomes a test needs.
  if (first === 'checkout' && second) {
    const payment = payments.get(second);
    if (!payment) {
      return notFound(response);
    }
    if (request.method === 'POST' && id) {
      payment.status = id === 'pay' ? 'paid' : 'canceled';
      response.writeHead(303, { location: payment.redirectUrl });
      return response.end();
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return response.end(`<!doctype html><h1>${payment.description}</h1>
      <p>${payment.amount.value} ${payment.amount.currency}</p>
      <form method="post" action="/checkout/${payment.id}/pay"><button>Pay</button></form>
      <form method="post" action="/checkout/${payment.id}/cancel"><button>Cancel</button></form>`);
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
      amount: body.amount,
      description: body.description,
      redirectUrl: body.redirectUrl,
      webhookUrl: body.webhookUrl,
      locale: body.locale,
      metadata: body.metadata ?? null,
      createdAt: new Date().toISOString(),
      _links: {
        self: { href: `${base}/v2/payments/${paymentId}`, type: 'application/hal+json' },
        checkout: { href: `${base}/checkout/${paymentId}`, type: 'text/html' },
      },
    };
    payments.set(paymentId, payment);
    return send(response, 201, payment);
  }
  const payment = id ? payments.get(id) : undefined;
  if (!payment) {
    return notFound(response);
  }
  if (request.method === 'PATCH') {
    Object.assign(payment, await readJson(request));
  }
  return send(response, 200, payment);
}).listen(port, () => {
  process.stdout.write(`Mollie stub listening on ${base}\n`);
});
