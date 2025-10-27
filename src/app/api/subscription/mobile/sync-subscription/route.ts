// src/app/api/subscription/mobile/sync-subscription/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, TokenExpiredError, UnauthorizedError } from '@/lib/requireAuth';
import { getTursoClient } from '@/lib/turso';
import { syncSubscription, getUsageSnapshot } from '@/lib/billing';

type SyncSubscriptionRequest = {
  planCode?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: string | number | null;
  status?: string;
};

function normalizePeriodEnd(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    // Stripe timestamps are seconds
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  const maybeDate = new Date(value);
  if (Number.isNaN(maybeDate.getTime())) return null;
  return maybeDate.toISOString();
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireAuth(req.headers);
    const body = (await req.json().catch(() => ({}))) as SyncSubscriptionRequest;
    const planCode = String(body.planCode || '').trim();
    const stripeSubscriptionId = String(body.stripeSubscriptionId || '').trim();

    if (!planCode || !stripeSubscriptionId) {
      return NextResponse.json(
        { error: 'planCode en stripeSubscriptionId zijn verplicht' },
        { status: 400 }
      );
    }

    const db = getTursoClient();
    await syncSubscription(db, {
      accountId: me.sub,
      planCode,
      stripeSubscriptionId,
      currentPeriodEnd: normalizePeriodEnd(body.currentPeriodEnd),
      status: body.status ?? undefined,
    });

    const usage = await getUsageSnapshot(db, me.sub);

    return NextResponse.json({
      ok: true,
      usage,
    });
  } catch (err) {
    console.error('Error in /subscription/mobile/sync-subscription:', err);
    const status =
      err instanceof TokenExpiredError || err instanceof UnauthorizedError ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Internal Server Error' },
      { status }
    );
  }
}
