// src/app/api/mobileBackend/points/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';
import { requireAuth, TokenExpiredError, UnauthorizedError } from '@/lib/requireAuth';

export async function POST(req: NextRequest) {
  try {
    const me = await requireAuth(req.headers);
    const subId = String(me.sub);

    const db = getTursoClient();
    const res = await db.execute(
      `SELECT *
         FROM rewards
        WHERE subId = ?
        ORDER BY created DESC`,
      [subId]
    );

    return NextResponse.json({ data: res.rows });
  } catch (err) {
    console.error('Error in /api/mobileBackend/points:', err);
    const status =
      err instanceof TokenExpiredError || err instanceof UnauthorizedError ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Internal Server Error' },
      { status }
    );
  }
}
