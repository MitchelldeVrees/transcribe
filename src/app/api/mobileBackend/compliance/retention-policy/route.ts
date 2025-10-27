import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';
import {
  canonicalPlanName,
  ensureRetentionSetting,
  fetchRetentionAuditLog,
  findRetentionOption,
  optionLockedForPlan,
  optionPayloadForPlan,
  selectRetentionOptionForPlan,
  toCanonicalPlanCode,
  upsertRetentionSelection,
  type CanonicalPlanCode,
} from '@/lib/retentionPolicy';
import { requireAuth, TokenExpiredError, UnauthorizedError } from '@/lib/requireAuth';

async function loadPlan(
  db: ReturnType<typeof getTursoClient>,
  accountId: string
): Promise<{ code: CanonicalPlanCode; name: string }> {
  const subRes = await db.execute(
    `SELECT plan_code
       FROM mobile_subscriptions
      WHERE account_id = ?
      LIMIT 1`,
    [accountId]
  );

  let raw = String((subRes.rows[0] as any)?.plan_code || '');

  if (!raw) {
    const planRes = await db.execute(
      `SELECT plan_code
         FROM user_plans
        WHERE subId = ?
        LIMIT 1`,
      [accountId]
    );
    raw = String((planRes.rows[0] as any)?.plan_code || 'free');
  }

  const canonical = toCanonicalPlanCode(raw) as CanonicalPlanCode;
  return {
    code: canonical,
    name: canonicalPlanName(canonical),
  };
}

async function buildPayload(db: ReturnType<typeof getTursoClient>, accountId: string) {
  const plan = await loadPlan(db, accountId);
  let setting = await ensureRetentionSetting(db, accountId, plan.code);
  let option = selectRetentionOptionForPlan(plan.code, setting.option_id);

  if (option.id !== setting.option_id) {
    setting = await upsertRetentionSelection(db, {
      accountId,
      planCode: plan.code,
      option,
    });
  }

  const options = optionPayloadForPlan(plan.code);
  const auditLog = await fetchRetentionAuditLog(db, accountId, 25);
  const auditReportUrl =
    setting.audit_report_url ??
    auditLog.find((entry) => Boolean(entry.report_url))?.report_url ??
    null;

  return {
    plan: {
      code: plan.code,
      name: plan.name,
    },
    options,
    currentPolicy: {
      optionId: option.id,
      label: option.label,
      days: option.days,
      description: option.description ?? null,
      locked: optionLockedForPlan(option, plan.code),
      retentionDays: option.days,
      updatedAt: setting.updated_at,
    },
    nextDeletionAt: setting.next_deletion_at,
    lastDeletionAt: setting.last_deletion_at ?? auditLog[0]?.run_at ?? null,
    nextDeletionCount: setting.next_deletion_count ?? 0,
    deletionWindowDays: setting.deletion_window_days ?? option.days,
    auditReportUrl,
    log: auditLog.map((entry) => ({
      id: entry.id,
      runAt: entry.run_at,
      deletedTranscripts: entry.deleted_transcripts,
      deletedAttachments: entry.deleted_attachments,
      retentionDays: entry.retention_days,
      actor: entry.actor,
      notes: entry.notes,
      reportUrl: entry.report_url,
    })),
  };
}

function handleError(err: unknown) {
  console.error('Error in /api/mobileBackend/compliance/retention-policy:', err);
  const status =
    err instanceof TokenExpiredError || err instanceof UnauthorizedError ? 401 : 500;
  const body =
    status === 401 ? { error: 'Unauthorized' } : { error: 'Internal Server Error' };
  return NextResponse.json(body, { status });
}

export async function GET(req: NextRequest) {
  try {
    const me = await requireAuth(req.headers);
    const db = getTursoClient();
    const payload = await buildPayload(db, me.sub);
    return NextResponse.json(payload);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const me = await requireAuth(req.headers);
    const db = getTursoClient();
    const body = await req.json().catch(() => ({} as any));
    const optionId = typeof body.optionId === 'string' ? body.optionId.trim() : '';
    if (!optionId) {
      return NextResponse.json({ error: 'optionId required' }, { status: 400 });
    }

    const plan = await loadPlan(db, me.sub);
    const option = findRetentionOption(optionId);
    if (!option) {
      return NextResponse.json({ error: 'Unknown retention option' }, { status: 400 });
    }
    if (optionLockedForPlan(option, plan.code)) {
      return NextResponse.json(
        {
          error: 'Option locked for current plan',
          lockedForPlan: plan.code,
        },
        { status: 403 }
      );
    }

    await upsertRetentionSelection(db, {
      accountId: me.sub,
      planCode: plan.code,
      option,
    });

    const payload = await buildPayload(db, me.sub);
    return NextResponse.json(payload);
  } catch (err) {
    return handleError(err);
  }
}
