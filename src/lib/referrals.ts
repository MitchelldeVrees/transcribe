// src/lib/referrals.ts
import type { Client, Transaction } from '@libsql/client/web';

const REFERRAL_CREDIT_INCREMENT = 5;

let schemaEnsured = false;

export type ReferralApplicationRow = {
  id: string;
  referral_code: string;
  inviter_user_id: string;
  inviter_sub_id: string;
  invitee_user_id: string;
  invitee_sub_id: string;
  idempotency_key: string;
  status: string;
  message: string;
  created_at: string;
};

export async function ensureReferralSchema(db: Client) {
  if (schemaEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS referral_codes (
      code TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      owner_sub_id TEXT NOT NULL,
      usage_limit INTEGER,
      usage_count INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    )
  `);

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_owner_idx
      ON referral_codes(owner_sub_id)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS referral_applications (
      id TEXT PRIMARY KEY,
      referral_code TEXT NOT NULL,
      inviter_user_id TEXT NOT NULL,
      inviter_sub_id TEXT NOT NULL,
      invitee_user_id TEXT NOT NULL,
      invitee_sub_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    )
  `);

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS referral_applications_invitee_idx
      ON referral_applications(invitee_sub_id)
  `);

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS referral_applications_idempotency_idx
      ON referral_applications(idempotency_key)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS referral_applications_code_idx
      ON referral_applications(referral_code)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_credit_balances (
      sub_id TEXT PRIMARY KEY,
      credits INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_credit_ledger (
      id TEXT PRIMARY KEY,
      sub_id TEXT NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      related_referral_application_id TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS user_credit_ledger_user_idx
      ON user_credit_ledger(sub_id)
  `);

  schemaEnsured = true;
}

export async function ensureReferralCodeRecord(
  db: Client,
  params: {
    code: string;
    ownerUserId: string;
    ownerSubId: string;
  }
) {
  await ensureReferralSchema(db);

  const code = params.code.trim();
  if (!code) return;

  const existing = await db.execute(
    `SELECT code
       FROM referral_codes
      WHERE owner_sub_id = ?
      LIMIT 1`,
    [params.ownerSubId]
  );

  if (existing.rows.length === 0) {
    await db.execute(
      `INSERT INTO referral_codes (code, owner_user_id, owner_sub_id)
       VALUES (?, ?, ?)`,
      [code, params.ownerUserId, params.ownerSubId]
    );
    return;
  }

  const currentCode = String((existing.rows[0] as any)?.code ?? '');
  if (currentCode !== code) {
    await db.execute(
      `UPDATE referral_codes
          SET code = ?,
              owner_user_id = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE owner_sub_id = ?`,
      [code, params.ownerUserId, params.ownerSubId]
    );
  }
}

export async function getCreditBalance(db: Client, subId: string): Promise<number> {
  await ensureReferralSchema(db);
  const res = await db.execute(
    `SELECT COALESCE(SUM(credits), 0) AS total
       FROM rewards
      WHERE subId = ?`,
    [subId]
  );
  const total = Number((res.rows[0] as any)?.total ?? 0);
  return Number.isFinite(total) ? total : 0;
}



export function referralCreditIncrement() {
  return REFERRAL_CREDIT_INCREMENT;
}
