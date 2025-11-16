import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';
import { requireAuth, TokenExpiredError, UnauthorizedError } from '@/lib/requireAuth';
import { ensureBillingTables } from '@/lib/billing';
import { ensureRetentionTables } from '@/lib/retentionPolicy';
import { ensureReferralSchema } from '@/lib/referrals';

export const runtime = 'nodejs';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isMissingTableError(err: unknown) {
  const msg = String((err as any)?.message || '').toLowerCase();
  return msg.includes('no such table') || msg.includes('no such column');
}

async function safeExec(
  db: ReturnType<typeof getTursoClient>,
  sql: string,
  params: Array<string | number>
) {
  try {
    await db.execute(sql, params);
  } catch (err) {
    if (!isMissingTableError(err)) {
      throw err;
    }
    console.warn('[account/delete] skipped statement because table is missing', { sql, err });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const me = await requireAuth(req.headers);
    const subId = String(me.sub);

    const db = getTursoClient();
    await Promise.all([
      ensureBillingTables(db),
      ensureRetentionTables(db),
      ensureReferralSchema(db),
    ]);

    const deletions: Array<{ sql: string; params: Array<string | number> }> = [
      { sql: `DELETE FROM transcripts WHERE subId = ?`, params: [subId] },
      { sql: `DELETE FROM usage_events WHERE subId = ?`, params: [subId] },
      { sql: `DELETE FROM usage_monthly WHERE subId = ?`, params: [subId] },
      { sql: `DELETE FROM transcribe_jobs WHERE subId = ?`, params: [subId] },
      { sql: `DELETE FROM user_plans WHERE subId = ?`, params: [subId] },
      { sql: `DELETE FROM mobile_customers WHERE account_id = ?`, params: [subId] },
      { sql: `DELETE FROM mobile_subscriptions WHERE account_id = ?`, params: [subId] },
      { sql: `DELETE FROM mobile_topups WHERE account_id = ?`, params: [subId] },
      { sql: `DELETE FROM user_retention_settings WHERE account_id = ?`, params: [subId] },
      { sql: `DELETE FROM retention_audit_log WHERE account_id = ?`, params: [subId] },
      { sql: `DELETE FROM referral_codes WHERE owner_sub_id = ?`, params: [subId] },
      {
        sql: `DELETE FROM referral_applications WHERE inviter_sub_id = ? OR invitee_sub_id = ?`,
        params: [subId, subId],
      },
      { sql: `DELETE FROM user_credit_balances WHERE sub_id = ?`, params: [subId] },
      { sql: `DELETE FROM user_credit_ledger WHERE sub_id = ?`, params: [subId] },
      { sql: `DELETE FROM rewards WHERE subId = ?`, params: [subId] },
      { sql: `DELETE FROM users WHERE subId = ?`, params: [subId] },
    ];

    for (const item of deletions) {
      await safeExec(db, item.sql, item.params);
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error('Error deleting account', err);
    const status =
      err instanceof TokenExpiredError || err instanceof UnauthorizedError ? 401 : 500;
    return jsonError(status === 401 ? 'Unauthorized' : 'Internal Server Error', status);
  }
}
