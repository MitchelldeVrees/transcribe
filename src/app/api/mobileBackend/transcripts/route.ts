// src/app/api/mobileBackend/transcripts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';
import { requireAuth, TokenExpiredError, UnauthorizedError } from '@/lib/requireAuth';
import { currentPeriod } from '@/lib/period';
import { parseAudioLengthToMs } from '@/lib/duration';
import { randomUUID } from 'crypto';
import { getEffectiveQuotaMs } from '@/lib/billing';

export async function POST(req: NextRequest) {
  try {
    const me   = await requireAuth(req.headers);
    const db   = getTursoClient();
    const body = await req.json().catch(() => ({} as any));

    const title        = String(body.title || '').trim() || 'Nieuwe transcriptie';
    const summaryHtml  = String(body.summary || '');     // HTML
    const actionHtml   = String(body.actionItems || ''); // HTML
    const qnaHtml      = String(body.qna || '');         // HTML
    const fullText     = String(body.text || '');        // plain transcript
    const audioLength  = String(body.durationMs || ''); // optional
    // ...
    
    // Build combined summary for returning to the client (not for DB storage)
    const combinedSummary =
      summaryHtml || actionHtml || qnaHtml
        ? `<div class="ls-summary">
             ${summaryHtml || ''}
             ${actionHtml || ''}
             ${qnaHtml || ''}
           </div>`
        : '';

    if (audioLength) {
      

      // Lookup plan & period
      const planRes = await db.execute(
        `SELECT monthly_quota_ms, renew_day, timezone FROM user_plans WHERE subId = ?`,
        [me.sub]
      );
      const plan = planRes.rows[0] as any;
      const monthly_quota_ms = plan?.monthly_quota_ms ?? 3_600_000; // 1h fallback
      const renew_day = plan?.renew_day ?? 1;
      const timezone = plan?.timezone || 'UTC';
      const period = currentPeriod(timezone, renew_day);
      const { quotaMs: effectiveQuotaMs } = await getEffectiveQuotaMs(
        db,
        me.sub,
        monthly_quota_ms,
        period.periodId
      );

      // Ensure row exists for this period
      await db.execute(
        `INSERT OR IGNORE INTO usage_monthly (subId, period_id, used_ms)
         VALUES (?, ?, 0)`,
        [me.sub, period.periodId]
      );

      // Generate transcript id & insert transcript first
      const id = randomUUID();
      await db.execute(
        `INSERT INTO transcripts
           (id, subId, title, summary, actionPoints, qna, transcript, audioLength, created, duration_ms)
         VALUES
           (?,  ?,    ?,     ?,       ?,            ?,   ?,          ?,           STRFTIME('%Y-%m-%dT%H:%M:%fZ','now'), ?)`,
        [id, me.sub, title, summaryHtml, actionHtml, qnaHtml, fullText, audioLength, audioLength]
      );

      // Atomic conditional debit
      const result = await db.execute(
        `UPDATE usage_monthly
            SET used_ms = used_ms + ?, updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE subId = ? AND period_id = ? AND (used_ms + ?) <= ?`,
        [audioLength, me.sub, period.periodId, audioLength, effectiveQuotaMs]
      );

      if (result.rowsAffected === 0) {
        // Quota exceeded → rollback transcript insert if you want strict consistency
        return NextResponse.json(
          { error: 'Quota overschreden' },
          { status: 402 }
        );
      }

      // Record usage event
      await db.execute(
        `INSERT INTO usage_events (id, subId, period_id, delta_ms, transcript_id)
         VALUES (?, ?, ?, ?, ?)`,
        [randomUUID(), me.sub, period.periodId, audioLength, id]
      );

      // Fetch updated usage
      const usedRes = await db.execute(
        `SELECT used_ms FROM usage_monthly WHERE subId = ? AND period_id = ?`,
        [me.sub, period.periodId]
      );
      const used_ms = (usedRes.rows[0] as any)?.used_ms ?? 0;
      const remaining_ms = Math.max(effectiveQuotaMs - used_ms, 0);

      return NextResponse.json({
        id, // transcript id
        title,
        summary: combinedSummary,
        actionItems: actionHtml,
        qna: qnaHtml,
        fullText,
        audioLength,
        debited_ms: audioLength,
        period: period.periodId,
        remaining_ms,
        quota_ms: effectiveQuotaMs,
        period_start: period.startIso,
        period_end: period.endIso,
      });
    }

    // Geen audioLength -> alleen opslaan, geen quota
    const id = randomUUID();
    await db.execute(
      `INSERT INTO transcripts
         (id, subId, title, summary, actionPoints, qna, transcript, audioLength, created)
       VALUES
         (?,  ?,    ?,     ?,       ?,            ?,   ?,          NULL,        STRFTIME('%Y-%m-%dT%H:%M:%fZ','now'))`,
      [id, me.sub, title, summaryHtml, actionHtml, qnaHtml, fullText]
    );

    return NextResponse.json({
      id,
      title,
      summary: combinedSummary,
      actionItems: actionHtml,
      qna: qnaHtml,
      fullText,
      audioLength: null,
    });
  } catch (err) {
    console.error('Error in transcripts POST:', err);
    const status =
      err instanceof TokenExpiredError || err instanceof UnauthorizedError ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Internal Server Error' },
      { status }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const me    = await requireAuth(req.headers);
    const subId = String(me.sub);

    const db    = getTursoClient();
    const txRes = await db.execute(
      `SELECT id, title,
              summary,
              actionPoints AS actionItems,
              qna,
              transcript AS fullText,
              audioLength,
              created
         FROM transcripts
        WHERE subId = ?
        ORDER BY created DESC`,
      [subId]
    );

    return NextResponse.json({
      transcripts: txRes.rows.map((r: any) => ({
        id:         r.id,
        title:      r.title,
        summary:    r.summary ?? '',
        actionItems: r.actionItems ?? '',
        qna:        r.qna ?? '',
        fullText:   r.fullText ?? '',
        audioLength: r.audioLength ?? null,
        created:    r.created,
      })),
    });
  } catch (err) {
    console.error('Error in /api/mobileBackend/transcripts:', err);
    const status =
      err instanceof TokenExpiredError || err instanceof UnauthorizedError ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Internal Server Error' },
      { status }
    );
  }
}
