// src/app/api/subscription/mobile/create-topup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { requireAuth, TokenExpiredError, UnauthorizedError } from '@/lib/requireAuth';
import { getTursoClient } from '@/lib/turso';
import { findTopUp, getOrCreateStripeCustomerId } from '@/lib/billing';
import { getStripeClient, STRIPE_API_VERSION } from '@/lib/stripe';

type CreateTopUpRequest = {
  topUpId?: string;
};

export async function POST(req: NextRequest) {
  try {
    const me = await requireAuth(req.headers);
    const body = (await req.json().catch(() => ({}))) as CreateTopUpRequest;
    const topUpId = String(body.topUpId || '').trim();
    if (!topUpId) {
      return NextResponse.json({ error: 'topUpId is verplicht' }, { status: 400 });
    }

    const topUp = findTopUp(topUpId);
    if (!topUp) {
      return NextResponse.json({ error: 'Onbekende topUpId' }, { status: 400 });
    }
    if (!topUp.stripePriceId) {
      return NextResponse.json(
        { error: 'Top-up is niet geconfigureerd voor Stripe' },
        { status: 400 }
      );
    }

    const db = getTursoClient();
    const stripe = getStripeClient();
    const customerId = await getOrCreateStripeCustomerId(db, stripe, me.sub);

    const baseIdempotencyKey =
      req.headers.get('Idempotency-Key') ??
      `mobile-topup-${me.sub}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;

    await stripe.invoiceItems.create(
      {
        customer: customerId,
        price: topUp.stripePriceId,
        metadata: {
          accountId: me.sub,
          topUpId: topUp.id,
        },
      } as unknown as Stripe.InvoiceItemCreateParams,
      { idempotencyKey: `${baseIdempotencyKey}:invoiceitem` }
    );

    const draftInvoice = await stripe.invoices.create(
      {
        customer: customerId,
        collection_method: 'charge_automatically',
        pending_invoice_items_behavior: 'include',
        auto_advance: false,
        metadata: {
          accountId: me.sub,
          topUpId: topUp.id,
        },
        description: topUp.label,
      },
      { idempotencyKey: `${baseIdempotencyKey}:invoice` }
    );

    if (!draftInvoice.id) {
      throw new Error('Stripe invoice misconfigured (missing id)');
    }

    const finalizedInvoice = await stripe.invoices.finalizeInvoice(draftInvoice.id, {
      expand: ['payment_intent'],
    });

    const invoice = finalizedInvoice as Stripe.Invoice & {
      payment_intent?: Stripe.PaymentIntent | string | null;
    };

    let paymentIntent =
      invoice.payment_intent && typeof invoice.payment_intent === 'object'
        ? (invoice.payment_intent as Stripe.PaymentIntent)
        : null;
    const paymentIntentId =
      invoice.payment_intent && typeof invoice.payment_intent === 'string'
        ? invoice.payment_intent
        : paymentIntent?.id ?? null;

    if ((!paymentIntent || !paymentIntent.client_secret) && paymentIntentId) {
      try {
        const fetched = await stripe.paymentIntents.retrieve(paymentIntentId);
        paymentIntent = fetched;
      } catch (piErr: any) {
        console.error('Stripe top-up payment intent fallback failed', {
          paymentIntentId,
          message: piErr?.message,
          type: piErr?.type,
          status: piErr?.statusCode,
          requestId: piErr?.raw?.requestId,
        });
      }
    }

    if (!paymentIntent?.client_secret) {
      console.error('Stripe top-up invoice missing payment intent', invoice.id);
      return NextResponse.json(
        { error: 'Stripe gaf geen payment_intent terug' },
        { status: 502 }
      );
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: STRIPE_API_VERSION }
    );

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      intentType: 'payment' as const,
      customer: customerId,
      ephemeralKey: ephemeralKey.secret,
      flow: 'topup' as const,
      topUpId: topUp.id,
      stripeInvoiceId: invoice.id,
      stripePaymentIntentId: paymentIntent.id,
      minutesGranted: topUp.minutesGranted,
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
