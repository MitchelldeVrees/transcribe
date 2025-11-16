import { NextRequest, NextResponse } from 'next/server';
// import { requireAuth } from '@/lib/requireAuth';

const API_VERSION = '2025-10-29.clover';

const STRIPE_SECRET_KEY =
  process.env.STRIPE_SECRET_KEY ||
  'sk_test_51Rol7RB9EArAYExWlGYhIZywKNrrgTTwYspbtH9iO0ACt55S2F2neK909dIui8COfKBudDxKyQOj3ePhQxvpGzHO00MiKruX3W';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

type ReqBody = {
  priceId: string;
  customerId?: string;
};

function form(body: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue;
    params.append(key, String(value));
  }
  return params;
}

async function stripeFetch<T = any>(
  method: 'GET' | 'POST',
  path: string,
  body?: URLSearchParams,
  extraHeaders?: Record<string, string>
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Stripe-Version': API_VERSION,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(extraHeaders ?? {}),
    },
    body: body ? body.toString() : undefined,
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { ok: res.ok, status: res.status, data };
}

export async function POST(req: NextRequest) {
  try {
    // await requireAuth(req.headers);

    const { priceId, customerId }: ReqBody = await req.json();
    if (!priceId) {
      return NextResponse.json(
        { error: 'Je moet een priceId meegeven.' },
        { status: 400, headers: CORS }
      );
    }

    {
      const probe = await fetch('https://api.stripe.com/v1/prices?limit=1', {
        headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
      });
      if (!probe.ok) {
        const text = await probe.text().catch(() => '');
        console.error('Stripe canary failed', probe.status, text.slice(0, 300));
        return NextResponse.json(
          {
            error: 'network_canary_failed',
            message: 'Worker cannot reach Stripe via HTTPS. Check routing/DNS/egress.',
            status: probe.status,
            bodyPreview: text.slice(0, 200),
          },
          { status: 502, headers: CORS }
        );
      }
    }

    const idem =
      req.headers.get('Idempotency-Key') ??
      `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    let customerIdToUse = customerId;
    if (!customerIdToUse) {
      const createCust = await stripeFetch('POST', '/v1/customers', form({}));
      if (!createCust.ok) {
        console.error('Create customer failed', createCust.status, createCust.data);
        return NextResponse.json(
          { error: 'stripe_customer_error', details: createCust.data },
          { status: 400, headers: CORS }
        );
      }
      customerIdToUse = (createCust.data as any).id;
    }

    const subBody = new URLSearchParams();
    subBody.append('customer', customerIdToUse!);
    subBody.append('items[0][price]', priceId);
    subBody.append('payment_behavior', 'default_incomplete');
    subBody.append('payment_settings[save_default_payment_method]', 'on_subscription');
    subBody.append('payment_settings[payment_method_types][]', 'card');
    subBody.append('expand[]', 'latest_invoice.payment_intent');

    const createSub = await stripeFetch(
      'POST',
      '/v1/subscriptions',
      subBody,
      { 'Idempotency-Key': idem }
    );

    if (!createSub.ok) {
      console.error('Create subscription failed', createSub.status, createSub.data);
      return NextResponse.json(
        { error: 'stripe_subscription_error', details: createSub.data },
        { status: 400, headers: CORS }
      );
    }

    const subscription = createSub.data as any;
    const invoice = subscription.latest_invoice;
    const paymentIntent = invoice?.payment_intent;

    if (!paymentIntent?.client_secret) {
      console.error('Missing payment_intent.client_secret', { invoice });
      return NextResponse.json(
        {
          error: 'missing_client_secret',
          message:
            'Geen client_secret gevonden. Is het priceId een terugkerende prijs (recurring)?',
          details: { invoice },
        },
        { status: 500, headers: CORS }
      );
    }

    const ephBody = form({ customer: customerIdToUse! });
    const ephKey = await stripeFetch(
      'POST',
      '/v1/ephemeral_keys',
      ephBody,
      { 'Stripe-Version': API_VERSION }
    );
    if (!ephKey.ok) {
      console.error('Create ephemeral key failed', ephKey.status, ephKey.data);
      return NextResponse.json(
        { error: 'stripe_ephemeral_error', details: ephKey.data },
        { status: 400, headers: CORS }
      );
    }

    return NextResponse.json(
      {
        clientSecret: paymentIntent.client_secret,
        intentType: 'payment',
        customer: customerIdToUse!,
        ephemeralKey: (ephKey.data as any).secret,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
      },
      { status: 200, headers: CORS }
    );
  } catch (err: any) {
    console.error('Create-subscription fatal:', {
      msg: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { error: 'internal_error', message: err?.message || 'Unknown error' },
      { status: 500, headers: CORS }
    );
  }
}
