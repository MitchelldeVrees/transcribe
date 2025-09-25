// app/api/mobileBackend/transcribe/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';
import { requireAuth } from '@/lib/requireAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const me = await requireAuth(req.headers);
    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId') || '';
    if (!jobId) return json('Missing jobId', 400);

    const db = getTursoClient();
    console.log('STATUS check', { jobId, subId: me.sub });

    let res = await db.execute(
      `SELECT status, result_text AS text, error
         FROM transcribe_jobs
        WHERE id = ? AND subId = ?`,
      [jobId, me.sub]
    );

    if (!res.rows.length) {
      console.warn('STATUS id+sub not found. Falling back to id-only.', { jobId, subId: me.sub });
      res = await db.execute(
        `SELECT status, result_text AS text, error
           FROM transcribe_jobs
          WHERE id = ?`,
        [jobId]
      );
      if (!res.rows.length) {
        console.error('STATUS not found even by id', { jobId });
        return json('Not found', 404);
      }
    }

    const row = res.rows[0] as any;
    return NextResponse.json({
      status: row.status,
      text: row.text || null,
      error: row.error || null,
    });
  } catch (e: any) {
    console.error('STATUS 500', { msg: e?.message, stack: e?.stack });
    const isAuth = String(e?.message || e).includes('Unauthorized');
    return json(isAuth ? 'Unauthorized' : 'Internal Server Error', isAuth ? 401 : 500);
  }
}
