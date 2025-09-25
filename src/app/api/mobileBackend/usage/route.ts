// src/app/api/mobileBackend/usage/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';
import { requireAuth, TokenExpiredError, UnauthorizedError } from '@/lib/requireAuth';
import { currentPeriod } from '@/lib/period';

export async function GET(req: NextRequest) {
  try {
    const me = await requireAuth(req.headers);
    const db = getTursoClient();

    // Plan + period
    const planRes = await db.execute(
      `SELECT plan_code, monthly_quota_ms, renew_day, timezone
         FROM user_plans
        WHERE subId = ?
        LIMIT 1`,
      [me.sub]
    );
    const plan = (planRes.rows[0] as any) ?? {};
    const monthly_quota_ms = Number(plan?.monthly_quota_ms ?? 0);
    const renew_day = Number(plan?.renew_day ?? 1);
    const timezone = String(plan?.timezone || 'UTC');
    const period = currentPeriod(timezone, renew_day);

    // Ensure usage row for this period
    await db.execute(
      `INSERT OR IGNORE INTO usage_monthly (subId, period_id, used_ms)
       VALUES (?, ?, 0)`,
      [me.sub, period.periodId]
    );

    // Current usage
    const usedRes = await db.execute(
      `SELECT used_ms FROM usage_monthly WHERE subId = ? AND period_id = ?`,
      [me.sub, period.periodId]
    );
    const used_ms = Number((usedRes.rows[0] as any)?.used_ms ?? 0);
    const remaining_ms = Math.max(monthly_quota_ms - used_ms, 0);

    // Details (positive debits this period)
    const detailsRes = await db.execute(
      `SELECT
          ue.id            AS usage_event_id,
          ue.delta_ms      AS delta_ms,
          ue.transcript_id AS transcriptId,
          t.title          AS title,
          t.audioLength    AS audioLength,
          COALESCE(t.duration_ms, ue.delta_ms) AS duration_ms,
          t.created        AS created
         FROM usage_events ue
    LEFT JOIN transcripts t ON t.id = ue.transcript_id
        WHERE ue.subId = ? AND ue.period_id = ? AND ue.delta_ms > 0
        ORDER BY t.created DESC`,
      [me.sub, period.periodId]
    );

    const details = detailsRes.rows.map((r: any) => {
      const ms = Number(r.delta_ms || 0);
      return {
        usage_event_id: r.usage_event_id,
        transcriptId:   r.transcriptId,
        title:          r.title || 'Transcript',
        audioLength:    r.audioLength || null,
        delta_ms:       ms,
        minutes:        Math.max(0, Math.round(ms / 60000)),
        created:        r.created,
      };
    });

    // Convenience minute fields + pct
    const toMin = (ms: number) => Math.round(ms / 60000);
    const quota_minutes     = toMin(monthly_quota_ms);
    const used_minutes      = toMin(used_ms);
    const remaining_minutes = toMin(remaining_ms);
    const used_pct = monthly_quota_ms > 0
      ? Math.min(100, Math.round((used_ms / monthly_quota_ms) * 100))
      : 0;

    // Back-compat top-level keys + richer structure
    return NextResponse.json({
      // original shape (kept)
      plan: plan?.plan ?? plan?.plan_code ?? 'free',
      period_id:    period.periodId,
      period_start: period.startIso,
      period_end:   period.endIso,
      monthly_quota_ms,
      used_ms,
      remaining_ms,

      // new helpers
      monthly_quota_minutes: quota_minutes,
      used_minutes,
      remaining_minutes,
      used_pct,

      // rich blocks (optional for client)
      period: { id: period.periodId, startIso: period.startIso, endIso: period.endIso },
      plan_info: {
        code: plan?.plan_code ?? plan?.plan ?? 'free',
        monthly_quota_ms,
        monthly_quota_minutes: quota_minutes,
        renew_day,
        timezone,
      },
      usage: {
        used_ms, remaining_ms, quota_ms: monthly_quota_ms,
        used_minutes, remaining_minutes, quota_minutes: quota_minutes,
        used_pct,
      },
      details, // per-transcript debits this period
    });
  } catch (err) {
    console.error('Error in /api/mobileBackend/usage:', err);
    const status =
      err instanceof TokenExpiredError || err instanceof UnauthorizedError ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Internal Server Error' },
      { status }
    );
  }
}
