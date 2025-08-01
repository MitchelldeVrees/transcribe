// src/app/api/createSubscription/route.ts

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY in environment');
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2025-06-30.basil',
});

interface CreateSubReq {
  priceId: string;
}

export async function POST(request: NextRequest) {
  const { priceId } = (await request.json()) as CreateSubReq;
  if (!priceId) {
    return NextResponse.json(
      { error: 'Je moet een priceId meegeven.' },
      { status: 400 }
    );
  }

  try {
    // 1) maak een nieuwe Customer
    const customer = await stripe.customers.create();

    // 2) maak de Subscription met status 'incomplete'
    const subscription = await stripe.subscriptions.create({
      
      customer: customer.id,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      billing_mode: { type: 'flexible' },  // ✅ correcte vorm
      expand: ['latest_invoice.confirmation_secret'],       // haal confirmation_secret op :contentReference[oaicite:1]{index=1}
    });

    // 3) extraheer de confirmation_secret
    const invoice = subscription.latest_invoice as Stripe.Invoice & {
      confirmation_secret?: { client_secret: string; object: string };
    };
    const confirmation = invoice.confirmation_secret;
    if (!confirmation?.client_secret) {
      console.error('No confirmation_secret found on invoice', invoice);
      throw new Error('Geen client_secret gevonden in confirmation_secret van invoice');
    }

    const clientSecret = confirmation.client_secret;
    const intentType = confirmation.object === 'setup_intent' ? 'setup' : 'payment';

    // 4) maak een ephemeral key voor de mobiele SDK
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customer.id },
      { apiVersion: '2025-06-30.basil' }
    );

    
    // 5) stuur alles wat de client nodig heeft terug
    return NextResponse.json({
      clientSecret,
      intentType,
      customer: customer.id,
      ephemeralKey: ephemeralKey.secret,
      stripeSubscriptionId: subscription.id,
      
    });
  } catch (err: any) {
    console.error('Stripe subscription error:', err);
    return NextResponse.json(
      { error: err.message || 'Kon abonnement niet aanmaken.' },
      { status: 500 }
    );
  }
}
