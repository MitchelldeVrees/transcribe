// src/app/api/mobileBackend/transcribe/start/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';
import { requireAuth } from '@/lib/requireAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AZURE_FUNCTION_URL   = process.env.AZURE_FUNCTION_URL!;
const AZURE_CALLBACK_TOKEN = process.env.AZURE_CALLBACK_TOKEN!;
const AZURE_STORAGE_ACCOUNT = process.env.AZURE_STORAGE_ACCOUNT!;
const AZURE_BLOB_CONTAINER  = process.env.AZURE_BLOB_CONTAINER!;

function json(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireAuth(req.headers);
    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId') || '';
    if (!jobId) return json('Missing jobId', 400);
    if (!AZURE_FUNCTION_URL || !AZURE_CALLBACK_TOKEN) {
      return json('Server not configured', 500);
    }

    const ct = (req.headers.get('content-type') || '').toLowerCase();
    console.log('START content-type=', ct);

    // --- Always try to parse JSON first, regardless of header ---
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      const raw = await req.text().catch(() => '');
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = null;
      }
    }

    if (!body || typeof body !== 'object') {
      return json('Send JSON body: { blobName, size, mimeType, extraInfo }', 415);
    }

    const blobName  = String(body.blobName || '');
    const size      = Number(body.size || 0);
    const mimeType  = String(body.mimeType || '');
    const extraInfo = String(body.extraInfo || '');

    if (!blobName || !size || !mimeType) {
      return json('blobName, size, mimeType required', 400);
    }

    const db = getTursoClient();
    let inserted = false;
    try {
      await db.execute(
        `INSERT INTO transcribe_jobs (id, subId, status, extraInfo, updated_at)
         VALUES (?, ?, 'queued', ?, CURRENT_TIMESTAMP)`,
        [jobId, me.sub, extraInfo]
      );
      inserted = true;
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (!msg.includes('UNIQUE constraint failed: transcribe_jobs.id')) {
        throw err;
      }
      console.warn('transcribe_jobs already exists, updating instead', { jobId });
    }

    if (!inserted) {
      await db.execute(
        `UPDATE transcribe_jobs
            SET subId = ?,
                extraInfo = ?,
                status = CASE WHEN status IN ('queued','running') THEN status ELSE 'queued' END,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [me.sub, extraInfo, jobId]
      );
    }

    const origin = url.origin;
    const callbackUrl = `${origin}/api/mobileBackend/transcribe/callback?jobId=${encodeURIComponent(jobId)}`;

    const payload = {
      jobId,
      userSub: me.sub,
      account: AZURE_STORAGE_ACCOUNT,
      container: AZURE_BLOB_CONTAINER,
      blobName,
      mimeType,
      size,
      prompt: extraInfo,
      callbackUrl,
      callbackToken: AZURE_CALLBACK_TOKEN,
    };

    // 🔎 Await and log any non-2xx so you see problems right away
    let resp: Response | null = null;
    try {
      resp = await fetch(AZURE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-callback-token': AZURE_CALLBACK_TOKEN,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('Failed to reach Azure Function:', err);
      await db.execute(
        `UPDATE transcribe_jobs
           SET status='error', error=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=? AND subId=?`,
        ['Function unreachable', jobId, me.sub]
      );
      return json('Failed to invoke transcription worker', 502);
    }

    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      console.error('Azure Function returned', resp.status, t);
      await db.execute(
        `UPDATE transcribe_jobs
           SET status='error', error=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=? AND subId=?`,
        [`Function ${resp.status}: ${t.slice(0, 500)}`, jobId, me.sub]
      );
      return json('Transcription worker rejected the request', 502);
    }

    // Only flip to 'running' after the function accepted the job
    await db.execute(
      `UPDATE transcribe_jobs
         SET status = CASE WHEN status = 'queued' THEN 'running' ELSE status END,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND subId = ?`,
      [jobId, me.sub]
    );

    return NextResponse.json({ accepted: true, jobId }, { status: 202 });
  } catch (e: any) {
    console.error('start error:', e);
    const isAuth = String(e?.message || e).includes('Unauthorized');
    return json(isAuth ? 'Unauthorized' : 'Internal Server Error', isAuth ? 401 : 500);
  }
}
