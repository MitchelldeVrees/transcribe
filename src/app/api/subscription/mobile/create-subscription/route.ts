// src/app/api/subscription/mobile/create-subscription/route.ts
import type { Client } from '@libsql/client/web';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, TokenExpiredError, UnauthorizedError } from '@/lib/requireAuth';
import { getTursoClient } from '@/lib/turso';
import { findPlan, ensureBillingTables } from '@/lib/billing';
import { STRIPE_API_VERSION } from '@/lib/stripe';

type CreateSubscriptionRequest = {
  planCode?: string;
};

type IntentType = 'payment' | 'setup';

const STRIPE_API_BASE = 'https://api.stripe.com';
const NOW_SQL = "STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')";

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
  secretKey: string,
  log: (...args: any[]) => void,
  errLog: (...args: any[]) => void
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

  let resp: StripeRequestResult<{ id?: string }>;
  try {
    resp = await stripeRequest(secretKey, 'POST', '/v1/customers', { body: params });
  } catch (err: any) {
    errLog('stripe:customer:create:network-error', { message: err?.message });
    throw new Error('Stripe customer creation request failed');
  }

  if (!resp.ok || !resp.data || typeof (resp.data as any).id !== 'string') {
    errLog('stripe:customer:create:error', {
      status: resp.status,
      requestId: resp.requestId,
      response: resp.data,
    });
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

function mkDebugId() {
  try {
    // @ts-ignore
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `dbg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: NextRequest) {
  console.log('Entered create-subscription route');
  const debugId = mkDebugId();
  const t0 = Date.now();
  const cfRay = req.headers.get('cf-ray') || 'no-cf-ray';
  const ua = (req.headers.get('user-agent') || '').slice(0, 80);

  const log = (...args: any[]) => console.log('[create-subscription]', debugId, ...args);
  const warn = (...args: any[]) => console.warn('[create-subscription]', debugId, ...args);
  const errLog = (...args: any[]) => console.error('[create-subscription]', debugId, ...args);

  log('BEGIN', { cfRay, ua });

  try {
    console.time(`[${debugId}] requireAuth`);
    const me = await requireAuth(req.headers);
    console.timeEnd(`[${debugId}] requireAuth`);
    log('auth:ok', { accountId: me?.sub });

    console.time(`[${debugId}] parse-body`);
    const body = (await req.json().catch(() => ({}))) as CreateSubscriptionRequest;
    console.timeEnd(`[${debugId}] parse-body`);

    const planCode = String(body.planCode || '').trim();
    log('input', { planCode });

    if (!planCode) {
      warn('missing:planCode');
      return NextResponse.json({ error: 'planCode is verplicht' }, { status: 400 });
    }

    console.time(`[${debugId}] find-plan`);
    const plan = findPlan(planCode);
    console.timeEnd(`[${debugId}] find-plan`);

    if (!plan) {
      warn('unknown:planCode');
      return NextResponse.json({ error: 'Onbekende planCode' }, { status: 400 });
    }
    if (!plan.stripePriceId) {
      warn('plan:missing-stripePriceId', { planCode });
      return NextResponse.json(
        { error: 'Plan is niet geconfigureerd voor Stripe' },
        { status: 400 }
      );
    }
    log('plan:ok', { priceId: plan.stripePriceId });

    console.time(`[${debugId}] get-db`);
    const db = getTursoClient();
    console.timeEnd(`[${debugId}] get-db`);
    log('db:ok');

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      errLog('stripe:missing-secret');
      return NextResponse.json(
        { error: 'Stripe is niet geconfigureerd' },
        { status: 500 }
      );
    }
    log('stripe:http:init', { apiVersion: STRIPE_API_VERSION });

    console.time(`[${debugId}] get-or-create-customer`);
    const customerId = await getOrCreateStripeCustomerIdViaApi(
      db,
      me.sub,
      stripeSecretKey,
      log,
      errLog
    );
    console.timeEnd(`[${debugId}] get-or-create-customer`);
    log('stripe:customer:ok', { customerId });

    const idempotencyKey =
      req.headers.get('Idempotency-Key') ??
      `mobile-sub-${me.sub}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
    log('stripe:idempotency', { keySuffix: idempotencyKey.slice(-12) });

    try {
      console.time(`[${debugId}] stripe-probe`);
      const probe = await stripeRequest(stripeSecretKey, 'GET', '/v1/prices?limit=1');
      console.timeEnd(`[${debugId}] stripe-probe`);
      if (probe.ok) {
        log('stripe:probe:ok', { requestId: probe.requestId });
      } else {
        errLog('stripe:probe:failed', {
          status: probe.status,
          requestId: probe.requestId,
          response: probe.data,
        });
      }
    } catch (probeErr: any) {
      console.timeEnd(`[${debugId}] stripe-probe`);
      errLog('stripe:probe:error', { message: probeErr?.message });
    }

    log('subscription:create:start', {
      customerId,
      priceId: plan.stripePriceId,
      expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
    });

    console.time(`[${debugId}] create-subscription`);
    let subscription: any;
    try {
      const subBody = new URLSearchParams();
      subBody.append('customer', customerId);
      subBody.append('collection_method', 'charge_automatically');
      subBody.append('items[0][price]', plan.stripePriceId);
      subBody.append('payment_behavior', 'default_incomplete');
      subBody.append('payment_settings[save_default_payment_method]', 'on_subscription');
      subBody.append('payment_settings[payment_method_types][]', 'card');
      subBody.append('metadata[accountId]', me.sub);
      subBody.append('metadata[planCode]', planCode);
      subBody.append('expand[]', 'latest_invoice.payment_intent');
      subBody.append('expand[]', 'pending_setup_intent');

      const resp = await stripeRequest(
        stripeSecretKey,
        'POST',
        '/v1/subscriptions',
        {
          body: subBody,
          headers: { 'Idempotency-Key': idempotencyKey },
        }
      );
      console.timeEnd(`[${debugId}] create-subscription`);

      if (!resp.ok) {
        errLog('subscription:create:error', {
          status: resp.status,
          requestId: resp.requestId,
          response: resp.data,
        });
        return NextResponse.json(
          { error: 'stripe_subscription_error', details: resp.data ?? null },
          { status: resp.status >= 500 ? 502 : 400 }
        );
      }

      subscription = resp.data as any;
    } catch (e: any) {
      console.timeEnd(`[${debugId}] create-subscription`);
      errLog('subscription:create:network-error', { message: e?.message });
      throw e;
    }
    log('subscription:create:ok', { subId: subscription.id, status: subscription.status });

    const subscriptionExpanded = subscription ?? {};
    let latestInvoice: any =
      subscriptionExpanded && typeof subscriptionExpanded.latest_invoice === 'object'
        ? subscriptionExpanded.latest_invoice
        : null;
    if (!latestInvoice && subscriptionExpanded && typeof subscriptionExpanded.latest_invoice === 'string') {
      try {
        const invId = String(subscriptionExpanded.latest_invoice);
        const invResp = await stripeRequest(
          stripeSecretKey,
          'GET',
          `/v1/invoices/${encodeURIComponent(invId)}?expand[]=payment_intent`
        );
        if (invResp.ok) {
          latestInvoice = invResp.data as any;
          log('invoice:fetched', {
            invoiceId: latestInvoice?.id,
            hasPi: Boolean(latestInvoice?.payment_intent),
          });
        } else {
          errLog('invoice:fetch:error', {
            status: invResp.status,
            requestId: invResp.requestId,
            response: invResp.data,
          });
        }
      } catch (e: any) {
        errLog('invoice:fetch:network-error', { message: e?.message });
      }
    }

    let clientSecret: string | null = null;
    let intentType: IntentType = 'payment';

    let paymentIntentObj =
      latestInvoice && typeof latestInvoice.payment_intent === 'object'
        ? latestInvoice.payment_intent
        : null;
    let paymentIntentId =
      typeof latestInvoice?.payment_intent === 'string'
        ? latestInvoice.payment_intent
        : paymentIntentObj?.id ?? null;

    const pendingSetupObj =
      subscriptionExpanded &&
      typeof subscriptionExpanded.pending_setup_intent === 'object'
        ? subscriptionExpanded.pending_setup_intent
        : null;
    const setupIntentId =
      typeof subscriptionExpanded?.pending_setup_intent === 'string'
        ? subscriptionExpanded.pending_setup_intent
        : pendingSetupObj?.id ?? null;

    if (paymentIntentObj && typeof paymentIntentObj === 'object') {
      clientSecret = paymentIntentObj.client_secret ?? null;
      intentType = 'payment';
      log('intent:payment', {
        piId: paymentIntentObj.id,
        piStatus: paymentIntentObj.status,
        hasClientSecret: Boolean(clientSecret),
      });
    } else if (pendingSetupObj && typeof pendingSetupObj === 'object') {
      clientSecret = pendingSetupObj.client_secret ?? null;
      intentType = 'setup';
      log('intent:setup', {
        siId: pendingSetupObj.id,
        siStatus: pendingSetupObj.status,
        hasClientSecret: Boolean(clientSecret),
      });
    } else {
      warn('intent:none-found', {
        latestInvoiceId: latestInvoice?.id,
        hasPiObj: Boolean(
          latestInvoice?.payment_intent && typeof latestInvoice.payment_intent === 'object'
        ),
        hasPendingSetupObj: Boolean(
          subscriptionExpanded?.pending_setup_intent &&
            typeof subscriptionExpanded.pending_setup_intent === 'object'
        ),
      });
    }

    if (!clientSecret && !paymentIntentId && latestInvoice && typeof latestInvoice.id === 'string') {
      const invoiceAmountDue = typeof latestInvoice.amount_due === 'number' ? latestInvoice.amount_due : null;
      const invoiceCurrency = typeof latestInvoice.currency === 'string' ? latestInvoice.currency : null;
      if (invoiceAmountDue && invoiceAmountDue > 0 && invoiceCurrency) {
        try {
          const piBody = new URLSearchParams();
          piBody.append('amount', String(invoiceAmountDue));
          piBody.append('currency', invoiceCurrency);
          piBody.append('customer', customerId);
          piBody.append('payment_method_types[]', 'card');
          piBody.append('setup_future_usage', 'off_session');
          piBody.append('metadata[accountId]', me.sub);
          piBody.append('metadata[planCode]', planCode);
          piBody.append('metadata[stripeSubscriptionId]', subscription.id);
          piBody.append('metadata[stripeInvoiceId]', latestInvoice.id);

          const createPiResp = await stripeRequest(
            stripeSecretKey,
            'POST',
            '/v1/payment_intents',
            { body: piBody }
          );

          if (createPiResp.ok) {
            const createdPi = createPiResp.data as any;
            clientSecret = createdPi?.client_secret ?? null;
            intentType = 'payment';
            paymentIntentId = createdPi?.id ?? null;
            paymentIntentObj = createdPi;
            log('payment-intent:created', {
              paymentIntentId,
              invoiceId: latestInvoice.id,
              hasClientSecret: Boolean(clientSecret),
            });
          } else {
            errLog('payment-intent:create:error', {
              status: createPiResp.status,
              requestId: createPiResp.requestId,
              response: createPiResp.data,
            });
          }
        } catch (piCreateErr: any) {
          errLog('payment-intent:create:network-error', { message: piCreateErr?.message });
        }
      }
    }

    if (!clientSecret && paymentIntentId) {
      try {
        const resp = await stripeRequest(
          stripeSecretKey,
          'GET',
          `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`
        );
        if (resp.ok) {
          const intent = resp.data as any;
          clientSecret = intent?.client_secret ?? null;
          intentType = 'payment';
          log('intent:payment:fallback', {
            piId: intent?.id ?? paymentIntentId,
            status: intent?.status,
            hasClientSecret: Boolean(clientSecret),
          });
        } else {
          errLog('intent:payment:fallback:error', {
            status: resp.status,
            requestId: resp.requestId,
            response: resp.data,
          });
        }
      } catch (piErr: any) {
        errLog('intent:payment:fallback:network-error', { message: piErr?.message });
      }
    }

    if (!clientSecret && setupIntentId) {
      try {
        const resp = await stripeRequest(
          stripeSecretKey,
          'GET',
          `/v1/setup_intents/${encodeURIComponent(setupIntentId)}`
        );
        if (resp.ok) {
          const setupIntent = resp.data as any;
          clientSecret = setupIntent?.client_secret ?? null;
          intentType = 'setup';
          log('intent:setup:fallback', {
            siId: setupIntent?.id ?? setupIntentId,
            status: setupIntent?.status,
            hasClientSecret: Boolean(clientSecret),
          });
        } else {
          errLog('intent:setup:fallback:error', {
            status: resp.status,
            requestId: resp.requestId,
            response: resp.data,
          });
        }
      } catch (siErr: any) {
        errLog('intent:setup:fallback:network-error', { message: siErr?.message });
      }
    }

    const invoiceTotal = typeof latestInvoice?.total === 'number' ? latestInvoice.total : undefined;
    const invoiceAmountDue =
      typeof latestInvoice?.amount_due === 'number' ? latestInvoice.amount_due : undefined;
    const invoiceStatus = typeof latestInvoice?.status === 'string' ? latestInvoice.status : undefined;
    const subStatus = typeof subscription?.status === 'string' ? subscription.status : undefined;

    const stripeInvoiceId = latestInvoice?.id ?? null;
    let requiresPayment = true;

    if (!clientSecret) {
      const zeroOrPaid =
        invoiceTotal === 0 || invoiceAmountDue === 0 || invoiceStatus === 'paid';
      const activeWithoutPayment = zeroOrPaid || subStatus === 'active' || subStatus === 'trialing';
      if (activeWithoutPayment) {
        log('intent:none:zero-or-paid', {
          invoiceId: latestInvoice?.id,
          invoiceStatus,
          invoiceTotal,
          invoiceAmountDue,
          subStatus,
        });

        console.time(`[${debugId}] ephemeral-key`);
        let ephemeralKeySecret: string | null = null;
        let ephemeralKeyRequestId: string | null = null;
        try {
          const ephBody = new URLSearchParams();
          ephBody.append('customer', customerId);
          const ephResp = await stripeRequest(
            stripeSecretKey,
            'POST',
            '/v1/ephemeral_keys',
            { body: ephBody }
          );
          console.timeEnd(`[${debugId}] ephemeral-key`);
          ephemeralKeyRequestId = ephResp.requestId;
          if (ephResp.ok && ephResp.data && typeof (ephResp.data as any).secret === 'string') {
            ephemeralKeySecret = String((ephResp.data as any).secret);
          } else {
            errLog('ephemeralKey:error', {
              status: ephResp.status,
              requestId: ephResp.requestId,
              response: ephResp.data,
            });
          }
        } catch (e: any) {
          console.timeEnd(`[${debugId}] ephemeral-key`);
          errLog('ephemeralKey:network-error', { message: e?.message });
        }
        log('ephemeralKey:ok:zero-or-paid', {
          hasSecret: Boolean(ephemeralKeySecret),
          requestId: ephemeralKeyRequestId,
        });

        const currentPeriodEnd = subscriptionExpanded.current_period_end ?? null;
        const currentPeriodEndIso = currentPeriodEnd
          ? new Date(currentPeriodEnd * 1000).toISOString()
          : null;

        const durationMs = Date.now() - t0;
        log('END:success:zero-or-paid', { durationMs });
        return NextResponse.json(
          {
            clientSecret: null,
            intentType: 'payment' as IntentType,
            customer: customerId,
            ephemeralKey: ephemeralKeySecret,
            flow: 'subscription',
            planCode,
            stripeSubscriptionId: subscription.id,
            currentPeriodEnd: currentPeriodEndIso,
            debugId,
            requiresPayment: false,
            subscriptionStatus: subStatus,
            stripeInvoiceId: latestInvoice?.id ?? null,
            stripePaymentIntentId: null,
          },
          { status: 200 }
        );
      }

      errLog('intent:no-client-secret', { subId: subscription.id });
      return NextResponse.json(
        { error: 'Stripe gaf geen client_secret terug' },
        { status: 502 }
      );
    }

    requiresPayment = true;

    console.time(`[${debugId}] ephemeral-key`);
    let ephemeralKeySecret: string | null = null;
    let ephemeralKeyRequestId: string | null = null;
    try {
      const ephBody = new URLSearchParams();
      ephBody.append('customer', customerId);
      const ephResp = await stripeRequest(
        stripeSecretKey,
        'POST',
        '/v1/ephemeral_keys',
        { body: ephBody }
      );
      console.timeEnd(`[${debugId}] ephemeral-key`);
      ephemeralKeyRequestId = ephResp.requestId;
      if (!ephResp.ok || !ephResp.data || typeof (ephResp.data as any).secret !== 'string') {
        errLog('ephemeralKey:error', {
          status: ephResp.status,
          requestId: ephResp.requestId,
          response: ephResp.data,
        });
        return NextResponse.json(
          { error: 'stripe_ephemeral_error', details: ephResp.data ?? null },
          { status: ephResp.status >= 500 ? 502 : 400 }
        );
      }
      ephemeralKeySecret = String((ephResp.data as any).secret);
    } catch (e: any) {
      console.timeEnd(`[${debugId}] ephemeral-key`);
      errLog('ephemeralKey:network-error', { message: e?.message });
      throw e;
    }
    log('ephemeralKey:ok', {
      hasSecret: Boolean(ephemeralKeySecret),
      requestId: ephemeralKeyRequestId,
    });

    const currentPeriodEnd = subscriptionExpanded.current_period_end ?? null;
    const currentPeriodEndIso = currentPeriodEnd
      ? new Date(currentPeriodEnd * 1000).toISOString()
      : null;

    const durationMs = Date.now() - t0;
    log('END:success', { durationMs });

    return NextResponse.json(
      {
        clientSecret,
        intentType,
        customer: customerId,
        ephemeralKey: ephemeralKeySecret,
        flow: 'subscription',
        planCode,
        stripeSubscriptionId: subscription.id,
        stripeInvoiceId,
        stripePaymentIntentId: paymentIntentId,
        currentPeriodEnd: currentPeriodEndIso,
        debugId,
        requiresPayment,
      },
      { status: 200 }
    );
  } catch (err: any) {
    const durationMs = Date.now() - t0;
    errLog('FATAL', {
      message: err?.message,
      type: err?.type,
      code: err?.code,
      statusCode: err?.statusCode,
      requestId: err?.raw?.requestId,
      durationMs,
    });

    const status =
      err instanceof TokenExpiredError || err instanceof UnauthorizedError ? 401 : 500;

    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Internal Server Error', debugId },
      { status }
    );
  }
}
