// app/api/mobileBackend/transcribe/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AZURE_CALLBACK_TOKEN = process.env.AZURE_CALLBACK_TOKEN!;

function json(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('x-callback-token') || '';
    if (!token || token !== AZURE_CALLBACK_TOKEN) {
      console.error('Callback forbidden: bad token');
      return json('Forbidden', 403);
    }

    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId') || '';
    if (!jobId) return json('Missing jobId', 400);

    const body = await req.json().catch(() => ({} as any));
    const transcript =
      typeof body.transcript === 'string' ? body.transcript.trim()
      : typeof body.text === 'string' ? body.text.trim()
      : '';
    const status = typeof body.status === 'string' ? body.status : undefined;
    const errorMsg = typeof body.error === 'string' ? body.error : '';

    const db = getTursoClient();

    console.log('CALLBACK start', {
      jobId,
      status,
      hasTranscript: !!transcript,
      transcriptLen: transcript?.length ?? 0,
      hasError: !!errorMsg,
    });

    let res;
    if (transcript) {
      res = await db.execute(
        `UPDATE transcribe_jobs
           SET status='done',
               result_text=?,
               error=NULL,
               updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
        [transcript, jobId]
      );
    } else {
      res = await db.execute(
        `UPDATE transcribe_jobs
           SET status='error',
               error=?,
               updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
        [errorMsg || 'UNKNOWN', jobId]
      );
    }

    // @libsql/client returns rowsAffected; log it
    // (On some versions it's 'rowsAffected' or 'changes'; handle both.)
    const rowsAffected = (res as any).rowsAffected ?? (res as any).changes ?? 0;
    console.log('CALLBACK update result', { jobId, rowsAffected });

    // Read back to prove final state
    const check = await db.execute(
      `SELECT id, status, length(result_text) AS len, error, updated_at
         FROM transcribe_jobs
        WHERE id = ?`,
      [jobId]
    );
    console.log('CALLBACK verify row', check.rows[0]);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('callback error:', e?.message, e?.stack);
    return json('Internal Server Error', 500);
  }
}
