// src/app/api/subscription/mobile/sync-topup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, TokenExpiredError, UnauthorizedError } from '@/lib/requireAuth';
import { getTursoClient } from '@/lib/turso';
import { syncTopUp, getUsageSnapshot } from '@/lib/billing';
import { getStripeClient } from '@/lib/stripe';

type SyncTopUpRequest = {
  topUpId?: string;
  stripeInvoiceId?: string;
  stripePaymentIntentId?: string | null;
  minutesGranted?: number;
};

async function getStripeCustomerId(db: ReturnType<typeof getTursoClient>, accountId: string) {
  const res = await db.execute(
    `SELECT stripe_customer_id FROM mobile_customers WHERE account_id = ? LIMIT 1`,
    [accountId]
  );
  const existing = (res.rows[0] as any)?.stripe_customer_id;
  return existing ? String(existing) : undefined;
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireAuth(req.headers);
    const body = (await req.json().catch(() => ({}))) as SyncTopUpRequest;
    const topUpId = String(body.topUpId || '').trim();
    const stripeInvoiceId = String(body.stripeInvoiceId || '').trim();

    if (!topUpId || !stripeInvoiceId) {
      return NextResponse.json(
        { error: 'topUpId en stripeInvoiceId zijn verplicht' },
        { status: 400 }
      );
    }

    const db = getTursoClient();
    const stripe = getStripeClient();
    const stripeCustomerId = await getStripeCustomerId(db, me.sub);
    const verifyOpts = stripeCustomerId ? { stripe, customerId: stripeCustomerId } : undefined;
    const result = await syncTopUp(
      db,
      {
        accountId: me.sub,
        topUpId,
        stripeInvoiceId,
        stripePaymentIntentId: body.stripePaymentIntentId ?? null,
        minutesGranted: typeof body.minutesGranted === 'number' ? body.minutesGranted : undefined,
      },
      verifyOpts
    );

    const usage = await getUsageSnapshot(db, me.sub);

    return NextResponse.json({
      ok: true,
      created: result.created,
      usage,
    });
  } catch (err) {
    console.error('Error in /subscription/mobile/sync-topup:', err);
    const status =
      err instanceof TokenExpiredError || err instanceof UnauthorizedError ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Internal Server Error' },
      { status }
    );
  }
}
