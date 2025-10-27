// src/app/api/subscription/mobile/create-subscription/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { requireAuth, TokenExpiredError, UnauthorizedError } from '@/lib/requireAuth';
import { getTursoClient } from '@/lib/turso';
import {
  findPlan,
  getOrCreateStripeCustomerId,
} from '@/lib/billing';
import { getStripeClient, STRIPE_API_VERSION } from '@/lib/stripe';

type CreateSubscriptionRequest = {
  planCode?: string;
};

type IntentType = 'payment' | 'setup';

export async function POST(req: NextRequest) {
  try {
    const me = await requireAuth(req.headers);
    const body = (await req.json().catch(() => ({}))) as CreateSubscriptionRequest;
    const planCode = String(body.planCode || '').trim();
    if (!planCode) {
      return NextResponse.json({ error: 'planCode is verplicht' }, { status: 400 });
    }

    const plan = findPlan(planCode);
    if (!plan) {
      return NextResponse.json({ error: 'Onbekende planCode' }, { status: 400 });
    }
    if (!plan.stripePriceId) {
      return NextResponse.json(
        { error: 'Plan is niet geconfigureerd voor Stripe' },
        { status: 400 }
      );
    }

    const db = getTursoClient();
    const stripe = getStripeClient();
    const customerId = await getOrCreateStripeCustomerId(db, stripe, me.sub);

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: plan.stripePriceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      metadata: {
        accountId: me.sub,
        planCode,
      },
      expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
    });

    const subscriptionExpanded = subscription as Stripe.Subscription & {
      latest_invoice?: Stripe.Invoice | string | null;
      current_period_end?: number | null;
      pending_setup_intent?: Stripe.SetupIntent | string | null;
    };

    const latestInvoice =
      typeof subscriptionExpanded.latest_invoice === 'object'
        ? (subscriptionExpanded.latest_invoice as Stripe.Invoice & {
            payment_intent?: Stripe.PaymentIntent | string | null;
          })
        : null;

    let clientSecret: string | null = null;
    let intentType: IntentType = 'payment';
    if (
      latestInvoice &&
      latestInvoice.payment_intent &&
      typeof latestInvoice.payment_intent === 'object'
    ) {
      const intent = latestInvoice.payment_intent as Stripe.PaymentIntent;
      clientSecret = intent.client_secret ?? null;
      intentType = 'payment';
    } else if (
      subscriptionExpanded.pending_setup_intent &&
      typeof subscriptionExpanded.pending_setup_intent === 'object'
    ) {
      const setupIntent = subscriptionExpanded.pending_setup_intent as Stripe.SetupIntent;
      clientSecret = setupIntent.client_secret ?? null;
      intentType = 'setup';
    }

    if (!clientSecret) {
      console.error('Unable to resolve client secret for subscription', subscription.id);
      return NextResponse.json(
        { error: 'Stripe gaf geen client_secret terug' },
        { status: 502 }
      );
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: STRIPE_API_VERSION }
    );

    const currentPeriodEnd = subscriptionExpanded.current_period_end ?? null;
    const currentPeriodEndIso = currentPeriodEnd
      ? new Date(currentPeriodEnd * 1000).toISOString()
      : null;

    return NextResponse.json({
      clientSecret,
      intentType,
      customer: customerId,
      ephemeralKey: ephemeralKey.secret,
      flow: 'subscription',
      planCode,
      stripeSubscriptionId: subscription.id,
      currentPeriodEnd: currentPeriodEndIso,
    });
  } catch (err) {
    console.error('Error in /subscription/mobile/create-subscription:', err);
    const status =
      err instanceof TokenExpiredError || err instanceof UnauthorizedError ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Internal Server Error' },
      { status }
    );
  }
}
