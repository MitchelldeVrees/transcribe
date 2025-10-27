// src/app/api/subscription/mobile/state/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, TokenExpiredError, UnauthorizedError } from '@/lib/requireAuth';
import { getTursoClient } from '@/lib/turso';
import {
  getPlanCatalog,
  getTopUpCatalog,
  getCurrentPlanCode,
  getUsageSnapshot,
} from '@/lib/billing';

export async function GET(req: NextRequest) {
  try {
    const me = await requireAuth(req.headers);
    const db = getTursoClient();

    const [usage, currentPlanCode] = await Promise.all([
      getUsageSnapshot(db, me.sub),
      getCurrentPlanCode(db, me.sub),
    ]);

    return NextResponse.json({
      plans: getPlanCatalog(),
      topUps: getTopUpCatalog(),
      currentPlanCode,
      usage,
    });
  } catch (err) {
    console.error('Error in /subscription/mobile/state:', err);
    const status =
      err instanceof TokenExpiredError || err instanceof UnauthorizedError ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Internal Server Error' },
      { status }
    );
  }
}
