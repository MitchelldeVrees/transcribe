// src/lib/stripe.ts
import Stripe from 'stripe';

// Keep this aligned with the account's default Stripe API version.
export const STRIPE_API_VERSION = '2025-10-29.clover' as const;

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }

  stripeClient = new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
  });

  return stripeClient;
}
