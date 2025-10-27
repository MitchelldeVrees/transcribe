// src/app/api/subscription/mobile/sync-topup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, TokenExpiredError, UnauthorizedError } from '@/lib/requireAuth';
import { getTursoClient } from '@/lib/turso';
import { syncTopUp, getUsageSnapshot } from '@/lib/billing';

type SyncTopUpRequest = {
  topUpId?: string;
  stripeInvoiceId?: string;
  stripePaymentIntentId?: string | null;
  minutesGranted?: number;
};

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
    const result = await syncTopUp(db, {
      accountId: me.sub,
      topUpId,
      stripeInvoiceId,
      stripePaymentIntentId: body.stripePaymentIntentId ?? null,
      minutesGranted: typeof body.minutesGranted === 'number' ? body.minutesGranted : undefined,
    });

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
