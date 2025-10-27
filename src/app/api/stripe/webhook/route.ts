// src/app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripeClient } from '@/lib/stripe';
import { getTursoClient } from '@/lib/turso';
import {
  findAccountIdByCustomerId,
  findPlanByPriceId,
  findTopUpByPriceId,
  syncSubscription,
  syncTopUp,
} from '@/lib/billing';

export const runtime = 'nodejs';

type InvoiceWithExpansions = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
  lines: {
    data: Array<Stripe.InvoiceLineItem & { price?: Stripe.Price | null }>;
  };
  payment_intent?: Stripe.PaymentIntent | string | null;
};

type SubscriptionWithExpansions = Stripe.Subscription & {
  current_period_end?: number | null;
};

function resolveStripeCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer): string | null {
  if (!customer) return null;
  if (typeof customer === 'string') return customer;
  return customer.id;
}

function resolveStripeSubscriptionId(subscription: string | Stripe.Subscription | null): string | null {
  if (!subscription) return null;
  if (typeof subscription === 'string') return subscription;
  return subscription.id;
}

function extractPeriodEndFromInvoice(invoice: Stripe.Invoice): string | null {
  const expanded = invoice as InvoiceWithExpansions;
  const line = expanded.lines.data[0];
  const periodEnd = line?.period?.end;
  if (!periodEnd) return null;
  return new Date(periodEnd * 1000).toISOString();
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const db = getTursoClient();
  const expanded = invoice as InvoiceWithExpansions;
  const customerId = resolveStripeCustomerId(expanded.customer as any);
  if (!customerId) return;

  const accountId =
    expanded.metadata?.accountId ||
    (await findAccountIdByCustomerId(db, customerId));
  if (!accountId) return;

  const subscriptionId = resolveStripeSubscriptionId(expanded.subscription ?? null);
  if (subscriptionId) {
    const price = expanded.lines.data[0]?.price as Stripe.Price | undefined;
    const priceId = price?.id;
    const plan =
      (priceId && findPlanByPriceId(priceId)) ||
      (expanded.metadata?.planCode ? { code: expanded.metadata.planCode } : null);
    if (!plan?.code) return;

    await syncSubscription(db, {
      accountId,
      planCode: plan.code,
      stripeSubscriptionId: subscriptionId,
      currentPeriodEnd: extractPeriodEndFromInvoice(expanded),
      status: 'active',
    });
    return;
  }

  const topUpId = expanded.metadata?.topUpId;
  if (!topUpId) return;

  const price = expanded.lines.data[0]?.price as Stripe.Price | undefined;
  const priceId = price?.id;
  const topUp = priceId ? findTopUpByPriceId(priceId) : undefined;

  if (!expanded.id) {
    console.warn('Stripe invoice missing id; skipping top-up sync');
    return;
  }

  await syncTopUp(db, {
    accountId,
    topUpId,
    stripeInvoiceId: expanded.id,
    stripePaymentIntentId:
      typeof expanded.payment_intent === 'string'
        ? expanded.payment_intent
        : (expanded.payment_intent as Stripe.PaymentIntent | null)?.id ?? undefined,
    minutesGranted: topUp?.minutesGranted,
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const db = getTursoClient();
  const expanded = subscription as SubscriptionWithExpansions;
  const customerId = resolveStripeCustomerId(expanded.customer as any);
  const accountId =
    expanded.metadata?.accountId ||
    (customerId ? await findAccountIdByCustomerId(db, customerId) : null);
  if (!accountId) return;

  const item = expanded.items.data[0];
  const price = item?.price as Stripe.Price | undefined;
  const priceId = price?.id;
  const plan =
    (priceId && findPlanByPriceId(priceId)) ||
    (expanded.metadata?.planCode ? { code: expanded.metadata.planCode } : null);
  if (!plan?.code) return;

  const periodEnd = expanded.current_period_end
    ? new Date(expanded.current_period_end * 1000).toISOString()
    : null;

  await syncSubscription(db, {
    accountId,
    planCode: plan.code,
    stripeSubscriptionId: expanded.id,
    currentPeriodEnd: periodEnd,
    status: expanded.status,
  });
}

async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  const db = getTursoClient();
  const expanded = invoice as InvoiceWithExpansions;
  const customerId = resolveStripeCustomerId(expanded.customer as any);
  const accountId =
    expanded.metadata?.accountId ||
    (customerId ? await findAccountIdByCustomerId(db, customerId) : null);
  if (!accountId) return;

  const subscriptionId = resolveStripeSubscriptionId(expanded.subscription ?? null);
  if (!subscriptionId) return;

  await syncSubscription(db, {
    accountId,
    planCode: 'free',
    stripeSubscriptionId: subscriptionId,
    currentPeriodEnd: null,
    status: 'past_due',
  });
}

export async function POST(req: NextRequest) {
  const stripe = getStripeClient();
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET for webhook handling');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature header' }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await handleInvoiceFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error('Error handling Stripe webhook event', event.type, err);
    return NextResponse.json({ error: 'Webhook handling failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
