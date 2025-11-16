// src/lib/plans.ts
import type { Client } from '@libsql/client/web';

type DBValue = string | number | bigint | boolean | null | Uint8Array;

const DEFAULT_MONTHLY_QUOTA_MS = 10 * 60 * 60 * 1000; // 10 hours

/**
 * Ensure a user has a row in user_plans. Defaults to the 'free' plan or a hardcoded quota.
 */
export async function ensureDefaultPlan(
  db: Client,
  subId: string,
  startedAtIso: string
) {
  const existingPlan = await db.execute(
    `SELECT 1 FROM user_plans WHERE subId = ? LIMIT 1`,
    [subId] as DBValue[]
  );

  if ((existingPlan as any).rows?.length) {
    return;
  }

  let planCode = 'free';
  let monthlyQuotaMs = DEFAULT_MONTHLY_QUOTA_MS;

  const catalogRes = await db.execute(
    `SELECT code, monthly_quota_ms
       FROM plans
      WHERE code = 'free'
      LIMIT 1`
  );

  if ((catalogRes as any).rows?.length) {
    const planRow = (catalogRes as any).rows[0] as any;
    planCode = String(planRow?.code ?? 'free');
    const maybeQuota = Number(planRow?.monthly_quota_ms ?? monthlyQuotaMs);
    if (Number.isFinite(maybeQuota) && maybeQuota > 0) {
      monthlyQuotaMs = maybeQuota;
    }
  }

  await db.execute(
    `INSERT OR IGNORE INTO user_plans
       (subId, plan_code, monthly_quota_ms, renew_day, timezone, started_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
    [subId, planCode, monthlyQuotaMs, 'UTC', startedAtIso] as DBValue[]
  );
}
