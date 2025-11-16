import type { Client } from '@libsql/client/web';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, TokenExpiredError, UnauthorizedError } from '@/lib/requireAuth';
import { getTursoClient } from '@/lib/turso';
import { ensureBillingTables, findTopUp } from '@/lib/billing';
import { STRIPE_API_VERSION } from '@/lib/stripe';

type CreateTopUpRequest = {
  topUpId?: string;
};

type StripeRequestOptions = {
  body?: URLSearchParams | null;
  headers?: Record<string, string | undefined>;
};

type StripeRequestResult<T = any> = {
  ok: boolean;
  status: number;
  data: T;
  requestId: string | null;
};

const STRIPE_API_BASE = 'https://api.stripe.com';
const NOW_SQL = "STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')";

async function stripeRequest<T = any>(
  secretKey: string,
  method: 'GET' | 'POST',
  path: string,
  options: StripeRequestOptions = {}
): Promise<StripeRequestResult<T>> {
  const { body = null, headers = {} } = options;

  const res = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Stripe-Version': STRIPE_API_VERSION,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...headers,
    },
    body: body ? body.toString() : undefined,
  });

  const raw = await res.text();
  let data: any = raw;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
    requestId: res.headers.get('request-id'),
  };
}

async function getOrCreateStripeCustomerIdViaApi(
  db: Client,
  accountId: string,
  secretKey: string
): Promise<string> {
  await ensureBillingTables(db);

  const existing = await db.execute(
    `SELECT stripe_customer_id FROM mobile_customers WHERE account_id = ? LIMIT 1`,
    [accountId]
  );
  const existingId = (existing.rows[0] as any)?.stripe_customer_id;
  if (existingId) {
    await db.execute(
      `UPDATE mobile_customers
          SET updated_at = ${NOW_SQL}
        WHERE account_id = ?`,
      [accountId]
    );
    return String(existingId);
  }

  const userRes = await db.execute(
    `SELECT email, name FROM users WHERE subId = ? LIMIT 1`,
    [accountId]
  );
  const userRow = userRes.rows[0] as any;

  const params = new URLSearchParams();
  params.append('metadata[accountId]', accountId);
  if (userRow?.email) params.append('email', String(userRow.email));
  if (userRow?.name) params.append('name', String(userRow.name));

  const resp = await stripeRequest(secretKey, 'POST', '/v1/customers', { body: params });
  if (!resp.ok || !resp.data || typeof (resp.data as any).id !== 'string') {
    throw new Error('Failed to create Stripe customer');
  }

  const customerId = String((resp.data as any).id);

  await db.execute(
    `INSERT INTO mobile_customers (account_id, stripe_customer_id)
     VALUES (?, ?)
     ON CONFLICT(account_id)
     DO UPDATE SET
       stripe_customer_id = excluded.stripe_customer_id,
       updated_at = ${NOW_SQL}`,
    [accountId, customerId]
  );

  return customerId;
}

export async function POST(req: NextRequest) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    console.error('Missing STRIPE_SECRET_KEY');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const debugId = `topup-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  try {
    const me = await requireAuth(req.headers);
    const body = (await req.json().catch(() => ({}))) as CreateTopUpRequest;
    const topUpId = String(body.topUpId || '').trim();
    if (!topUpId) {
      return NextResponse.json({ error: 'topUpId is verplicht' }, { status: 400 });
    }

    const topUp = findTopUp(topUpId);
    if (!topUp?.stripePriceId) {
      return NextResponse.json(
        { error: 'Top-up is niet geconfigureerd voor Stripe' },
        { status: 400 }
      );
    }

    const db = getTursoClient();
    const customerId = await getOrCreateStripeCustomerIdViaApi(
      db,
      me.sub,
      stripeSecretKey
    );

    const idempotencyKey =
      req.headers.get('Idempotency-Key') ??
      `mobile-topup-${me.sub}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;

    const priceResp = await stripeRequest(
      stripeSecretKey,
      'GET',
      `/v1/prices/${encodeURIComponent(topUp.stripePriceId)}?expand[]=product`
    );

    console.log('Price response:', priceResp);
    if (!priceResp.ok) {
      return NextResponse.json(
        { error: 'stripe_price_error', details: priceResp.data ?? null },
        { status: priceResp.status >= 500 ? 502 : 400 }
      );
    }
    const priceData = priceResp.data as any;
    const priceCurrency = String(
      priceData?.currency ?? topUp.currency ?? 'eur'
    ).toLowerCase();
    const rawUnitAmount =
      typeof priceData?.unit_amount === 'number'
        ? priceData.unit_amount
        : priceData?.unit_amount_decimal
        ? Math.round(Number(priceData.unit_amount_decimal))
        : topUp.amountCents ?? 0;
    if (!rawUnitAmount || rawUnitAmount <= 0) {
      throw new Error('Top-up price is missing an amount in cents.');
    }
    const productId =
      typeof priceData?.product === 'string'
        ? priceData.product
        : typeof priceData?.product?.id === 'string'
        ? priceData.product.id
        : null;

    const piBody = new URLSearchParams();
    piBody.append('amount', String(rawUnitAmount));
    piBody.append('currency', priceCurrency);
    piBody.append('customer', customerId);
    piBody.append('metadata[accountId]', me.sub);
    piBody.append('metadata[topUpId]', topUp.id);
    if (productId) {
      piBody.append('metadata[productId]', productId);
    }
    piBody.append('description', topUp.label);
    piBody.append('automatic_payment_methods[enabled]', 'true');

    const piResp = await stripeRequest(
      stripeSecretKey,
      'POST',
      '/v1/payment_intents',
      {
        body: piBody,
        headers: { 'Idempotency-Key': `${idempotencyKey}:payment_intent` },
      }
    );
    if (!piResp.ok) {
      return NextResponse.json(
        { error: 'stripe_payment_intent_error', details: piResp.data ?? null },
        { status: piResp.status >= 500 ? 502 : 400 }
      );
    }
    const paymentIntent = piResp.data as any;
    const paymentIntentId =
      typeof paymentIntent?.id === 'string' ? paymentIntent.id : null;
    const clientSecret =
      typeof paymentIntent?.client_secret === 'string'
        ? paymentIntent.client_secret
        : null;

    if (!paymentIntentId || !clientSecret) {
      return NextResponse.json(
        { error: 'Stripe gaf geen payment_intent terug' },
        { status: 502 }
      );
    }

    const ephParams = new URLSearchParams();
    ephParams.append('customer', customerId);
    const ephResp = await stripeRequest(
      stripeSecretKey,
      'POST',
      '/v1/ephemeral_keys',
      { body: ephParams }
    );
    if (!ephResp.ok) {
      return NextResponse.json(
        { error: 'stripe_ephemeral_error', details: ephResp.data ?? null },
        { status: ephResp.status >= 500 ? 502 : 400 }
      );
    }
    const ephemeralKeySecret =
      typeof (ephResp.data as any)?.secret === 'string'
        ? (ephResp.data as any).secret
        : null;

    if (!ephemeralKeySecret) {
      return NextResponse.json(
        { error: 'stripe_ephemeral_error', details: null },
        { status: 502 }
      );
    }

    return NextResponse.json({
      clientSecret,
      intentType: 'payment' as const,
      customer: customerId,
      ephemeralKey: ephemeralKeySecret,
      flow: 'topup' as const,
      topUpId: topUp.id,
      stripeInvoiceId: paymentIntentId,
      stripePaymentIntentId: paymentIntentId,
      minutesGranted: topUp.minutesGranted,
      debugId,
    });
  } catch (err) {
    console.error('Error in /subscription/mobile/create-topup:', err);
    const status =
      err instanceof TokenExpiredError || err instanceof UnauthorizedError ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Internal Server Error' },
      { status }
    );
  }
}
