// src/lib/stripe.ts
import Stripe from 'stripe';

const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2025-08-27.basil';

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  
  if (!stripeClient) {
    stripeClient = new Stripe('sk_test_51IOhNJCNUsKHlBxZiNASQEmkYEA3CGEypVMmvCvroXrlg52kSviRRm6OcofT5cxBf7J7fZHDdj0AMXSLXQqzndOp00ghiy4vYo', {
      apiVersion: STRIPE_API_VERSION,
    });
  }
  return stripeClient;
}

export { STRIPE_API_VERSION };
