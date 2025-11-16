// src/lib/billing.ts
import type { Client } from '@libsql/client/web';
import Stripe from 'stripe';
import { currentPeriod } from './period';
import {
  ensureRetentionTables,
  getRetentionSetting,
  selectRetentionOptionForPlan,
  toCanonicalPlanCode,
  upsertRetentionSelection,
} from './retentionPolicy';

export type MobilePlan = {
  code: string;
  name: string;
  description?: string;
  quotaMinutes: number;
  stripePriceId?: string;
  amountCents?: number;
  currency?: string;
  retentionOptionId?: string;
  isDefault?: boolean;
};

export type MobileTopUp = {
  id: string;
  label: string;
  minutesGranted: number;
  stripePriceId?: string;
  amountCents?: number;
  currency?: string;
  description?: string;
};

export type UsageSnapshot = {
  quotaMinutes: number;
  usedMinutes: number;
  remainingMinutes: number;
  bonusMinutes: number;
  baseQuotaMinutes: number;
  periodId: string;
  periodEndsAt: string;
};

export type SubscriptionSyncPayload = {
  accountId: string;
  planCode: string;
  stripeSubscriptionId: string;
  currentPeriodEnd?: string | null;
  status?: string;
};

export type TopUpSyncPayload = {
  accountId: string;
  topUpId: string;
  stripeInvoiceId: string;
  stripePaymentIntentId?: string | null;
  minutesGranted?: number;
};

type PlanDefinition = Omit<MobilePlan, 'stripePriceId'> & {
  stripePriceEnv?: string;
};

type TopUpDefinition = Omit<MobileTopUp, 'stripePriceId'> & {
  stripePriceEnv?: string;
};

const DEFAULT_PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    code: 'free',
    name: 'Gratis',
    description: '10 uur per maand, voldoende om het platform uit te proberen.',
    quotaMinutes: 600,
    retentionOptionId: '30d',
    isDefault: true,
  },
  {
    code: 'starter',
    name: 'Starter',
    description: 'Uitgebreide functies voor starters en zelfstandigen.',
    quotaMinutes: 900,
    stripePriceEnv: 'STRIPE_PRICE_PLAN_BASIC_ID',
    amountCents: 1299,
    currency: 'eur',
    retentionOptionId: '30d',
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'Voor professionals die wekelijks meerdere transcripties maken.',
    quotaMinutes: 1800,
    stripePriceEnv: 'STRIPE_PRICE_PLAN_STARTER',
    amountCents: 2499,
    currency: 'eur',
    retentionOptionId: '90d',
  },
  {
    code: 'team',
    name: 'Team',
    description: 'Samenwerken binnen teams met ruime marges.',
    quotaMinutes: 3600,
    stripePriceEnv: 'STRIPE_PRICE_PLAN_TEAM',
    amountCents: 4999,
    currency: 'eur',
    retentionOptionId: '180d',
  },
];

const DEFAULT_TOPUP_DEFINITIONS: TopUpDefinition[] = [
  {
    id: 'topup-60',
    label: '60 extra minuten',
    minutesGranted: 60,
    stripePriceEnv: 'STRIPE_PRICE_TOPUP_60',
    amountCents: 499,
    currency: 'eur',
    description: 'Een uur extra transcriptietijd voor deze periode.',
  },
  {
    id: 'topup-180',
    label: '180 extra minuten',
    minutesGranted: 180,
    stripePriceEnv: 'STRIPE_PRICE_TOPUP_180',
    amountCents: 1299,
    currency: 'eur',
    description: 'Voor als je tijdelijk veel extra interviews moet uitwerken.',
  },
];

let planCatalogCache: MobilePlan[] | null = null;
let topUpCatalogCache: MobileTopUp[] | null = null;
let billingTablesEnsured = false;

const MINUTES_MS = 60_000;

const NOW_SQL = "STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')";

function msToMinutes(ms: number): number {
  return Math.max(0, Math.round(ms / MINUTES_MS));
}

function minutesToMs(minutes: number): number {
  return Math.max(0, minutes * MINUTES_MS);
}

function resolveStripePriceId(def: PlanDefinition | TopUpDefinition): string | undefined {
  const envKey = def.stripePriceEnv;
  if (envKey) {
    const value = process.env[envKey];
    return value && value.trim().length ? value.trim() : undefined;
  }
  return undefined;
}

function buildPlanCatalog(): MobilePlan[] {
  return DEFAULT_PLAN_DEFINITIONS.map((def) => ({
    ...def,
    stripePriceId: resolveStripePriceId(def),
  }));
}

function buildTopUpCatalog(): MobileTopUp[] {
  return DEFAULT_TOPUP_DEFINITIONS.map((def) => ({
    ...def,
    stripePriceId: resolveStripePriceId(def),
  }));
}

export function getPlanCatalog(): MobilePlan[] {
  if (!planCatalogCache) {
    planCatalogCache = buildPlanCatalog();
  }
  return planCatalogCache;
}

export function getTopUpCatalog(): MobileTopUp[] {
  if (!topUpCatalogCache) {
    topUpCatalogCache = buildTopUpCatalog();
  }
  return topUpCatalogCache;
}

export function findPlan(planCode: string): MobilePlan | undefined {
  return getPlanCatalog().find((plan) => plan.code === planCode);
}

export function findPlanByPriceId(priceId: string): MobilePlan | undefined {
  return getPlanCatalog().find((plan) => plan.stripePriceId === priceId);
}

export function findTopUp(topUpId: string): MobileTopUp | undefined {
  return getTopUpCatalog().find((topUp) => topUp.id === topUpId);
}

export function findTopUpByPriceId(priceId: string): MobileTopUp | undefined {
  return getTopUpCatalog().find((topUp) => topUp.stripePriceId === priceId);
}

export async function ensureBillingTables(db: Client) {
  if (billingTablesEnsured) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS mobile_customers (
      account_id TEXT PRIMARY KEY,
      stripe_customer_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (${NOW_SQL}),
      updated_at TEXT NOT NULL DEFAULT (${NOW_SQL})
    )
  `);

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS mobile_customers_stripe_idx
      ON mobile_customers(stripe_customer_id)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS mobile_subscriptions (
      account_id TEXT PRIMARY KEY,
      stripe_subscription_id TEXT NOT NULL,
      plan_code TEXT NOT NULL,
      current_period_end TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (${NOW_SQL}),
      updated_at TEXT NOT NULL DEFAULT (${NOW_SQL})
    )
  `);

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS mobile_subscriptions_subscription_idx
      ON mobile_subscriptions(stripe_subscription_id)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS mobile_topups (
      stripe_invoice_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      top_up_id TEXT NOT NULL,
      ms_granted INTEGER NOT NULL,
      minutes_granted INTEGER NOT NULL,
      stripe_payment_intent_id TEXT,
      credited_period_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (${NOW_SQL})
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS mobile_topups_account_period_idx
      ON mobile_topups(account_id, credited_period_id)
  `);

  billingTablesEnsured = true;
}

type AccountPlanRow = {
  plan_code: string;
  monthly_quota_ms: number;
  renew_day: number;
  timezone: string;
};

async function fetchAccountPlan(db: Client, accountId: string): Promise<AccountPlanRow | null> {
  const res = await db.execute(
    `SELECT plan_code, monthly_quota_ms, renew_day, timezone
       FROM user_plans
      WHERE subId = ?
      LIMIT 1`,
    [accountId]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0] as any;
  return {
    plan_code: String(row.plan_code ?? 'free'),
    monthly_quota_ms: Number(row.monthly_quota_ms ?? 0),
    renew_day: Number(row.renew_day ?? 1),
    timezone: String(row.timezone || 'UTC'),
  };
}

async function ensureUsagePeriodRow(db: Client, accountId: string, periodId: string) {
  await db.execute(
    `INSERT OR IGNORE INTO usage_monthly (subId, period_id, used_ms)
     VALUES (?, ?, 0)`,
    [accountId, periodId]
  );
}

async function sumTopUpMs(db: Client, accountId: string): Promise<number> {
  await ensureBillingTables(db);
  const res = await db.execute(
    `SELECT COALESCE(SUM(ms_granted), 0) AS bonus_ms
       FROM mobile_topups
      WHERE account_id = ?
        AND datetime(created_at) >= datetime('now', '-365 days')`,
    [accountId]
  );
  const row = res.rows[0] as any;
  return Number(row?.bonus_ms ?? 0);
}

export async function getUsageSnapshot(db: Client, accountId: string): Promise<UsageSnapshot> {
  const planRow = await fetchAccountPlan(db, accountId);
  if (!planRow) {
    throw new Error('Account has no plan assignment');
  }

  const period = currentPeriod(planRow.timezone, planRow.renew_day);
  await ensureUsagePeriodRow(db, accountId, period.periodId);

  const usageRes = await db.execute(
    `SELECT used_ms FROM usage_monthly WHERE subId = ? AND period_id = ? LIMIT 1`,
    [accountId, period.periodId]
  );
  const usedMs = Number((usageRes.rows[0] as any)?.used_ms ?? 0);

  const bonusMs = await sumTopUpMs(db, accountId);
  const baseQuotaMs = Number(planRow.monthly_quota_ms ?? 0);
  const totalQuotaMs = baseQuotaMs + bonusMs;
  const remainingMs = Math.max(totalQuotaMs - usedMs, 0);

  return {
    quotaMinutes: msToMinutes(totalQuotaMs),
    usedMinutes: msToMinutes(usedMs),
    remainingMinutes: msToMinutes(remainingMs),
    bonusMinutes: msToMinutes(bonusMs),
    baseQuotaMinutes: msToMinutes(baseQuotaMs),
    periodId: period.periodId,
    periodEndsAt: period.endIso,
  };
}

export async function getCurrentPlanCode(db: Client, accountId: string): Promise<string> {
  const planRow = await fetchAccountPlan(db, accountId);
  return planRow?.plan_code ?? 'free';
}

export async function getEffectiveQuotaMs(
  db: Client,
  accountId: string,
  baseQuotaMs: number,
  periodId: string
): Promise<{ quotaMs: number; bonusMs: number }> {
  const bonusMs = await sumTopUpMs(db, accountId);
  return { quotaMs: baseQuotaMs + bonusMs, bonusMs };
}

async function fetchPlanQuotaFromDb(db: Client, planCode: string): Promise<number | null> {
  try {
    const res = await db.execute(
      `SELECT monthly_quota_ms FROM plans WHERE code = ? LIMIT 1`,
      [planCode]
    );
    if (!res.rows.length) return null;
    return Number((res.rows[0] as any)?.monthly_quota_ms ?? 0);
  } catch {
    return null;
  }
}

function planQuotaFromCatalog(planCode: string): number | null {
  const plan = findPlan(planCode);
  if (!plan) return null;
  return minutesToMs(plan.quotaMinutes);
}

export async function getOrCreateStripeCustomerId(
  db: Client,
  stripe: Stripe,
  accountId: string
): Promise<string> {
  await ensureBillingTables(db);

  const existing = await db.execute(
    `SELECT stripe_customer_id FROM mobile_customers WHERE account_id = ? LIMIT 1`,
    [accountId]
  );
  const existingId = (existing.rows[0] as any)?.stripe_customer_id;
  if (existingId) {
    await db.execute(
      `UPDATE mobile_customers
          SET updated_at = ${NOW_SQL}
        WHERE account_id = ?`,
      [accountId]
    );
    return String(existingId);
  }

  const userRes = await db.execute(
    `SELECT email, name FROM users WHERE subId = ? LIMIT 1`,
    [accountId]
  );
  const userRow = userRes.rows[0] as any;

  const customer = await stripe.customers.create({
    email: userRow?.email ?? undefined,
    name: userRow?.name ?? undefined,
    metadata: { accountId },
  });

  await db.execute(
    `INSERT INTO mobile_customers (account_id, stripe_customer_id)
     VALUES (?, ?)
     ON CONFLICT(account_id)
     DO UPDATE SET
       stripe_customer_id = excluded.stripe_customer_id,
       updated_at = ${NOW_SQL}`,
    [accountId, customer.id]
  );

  return customer.id;
}

async function determinePlanQuotaMs(
  db: Client,
  planCode: string,
  fallbackCurrentMs: number
): Promise<number> {
  const dbValue = await fetchPlanQuotaFromDb(db, planCode);
  if (dbValue && dbValue > 0) return dbValue;

  const catalogValue = planQuotaFromCatalog(planCode);
  if (catalogValue && catalogValue > 0) return catalogValue;

  if (fallbackCurrentMs > 0) return fallbackCurrentMs;

  const defaultPlan = findPlan('free');
  if (defaultPlan) return minutesToMs(defaultPlan.quotaMinutes);
  return minutesToMs(600);
}

export async function syncSubscription(
  db: Client,
  payload: SubscriptionSyncPayload,
  verify?: { stripe: Stripe; customerId?: string | null }
): Promise<void> {
  const { accountId, planCode, stripeSubscriptionId } = payload;
  if (!accountId || !planCode || !stripeSubscriptionId) {
    throw new Error('Missing fields for subscription sync');
  }

  await ensureBillingTables(db);
  await ensureRetentionTables(db);

  if (verify?.stripe) {
    const sub = await verify.stripe.subscriptions.retrieve(stripeSubscriptionId);
    if (!sub) {
      throw new Error('Unable to load subscription from Stripe');
    }
    if (sub.customer && verify.customerId && sub.customer !== verify.customerId) {
      throw new Error('Subscription does not belong to this account');
    }
    const allowedStatuses: Stripe.Subscription.Status[] = [
      'active',
      'trialing',
      'past_due',
      'incomplete',
    ];
    if (!allowedStatuses.includes(sub.status)) {
      throw new Error('Subscription is not active');
    }
  }

  const currentPlanRow = await fetchAccountPlan(db, accountId);
  const baseQuotaMs = await determinePlanQuotaMs(
    db,
    planCode,
    currentPlanRow?.monthly_quota_ms ?? 0
  );

  const renewDay = currentPlanRow?.renew_day ?? 1;
  const timezone = currentPlanRow?.timezone ?? 'UTC';
  const currentPeriodEndIso = payload.currentPeriodEnd ?? null;
  const status = payload.status ?? 'active';

  await db.execute(
    `INSERT INTO user_plans (subId, plan_code, monthly_quota_ms, renew_day, timezone, started_at)
     VALUES (?, ?, ?, ?, ?, ${NOW_SQL})
     ON CONFLICT(subId)
     DO UPDATE SET
       plan_code = excluded.plan_code,
       monthly_quota_ms = excluded.monthly_quota_ms`,
    [accountId, planCode, baseQuotaMs, renewDay, timezone]
  );

  await db.execute(
    `INSERT INTO mobile_subscriptions (account_id, stripe_subscription_id, plan_code, current_period_end, status)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(account_id)
     DO UPDATE SET
       stripe_subscription_id = excluded.stripe_subscription_id,
       plan_code = excluded.plan_code,
       current_period_end = excluded.current_period_end,
       status = excluded.status,
       updated_at = ${NOW_SQL}`,
    [accountId, stripeSubscriptionId, planCode, currentPeriodEndIso, status]
  );

  const canonicalPlan = toCanonicalPlanCode(planCode);
  const existingSetting = await getRetentionSetting(db, accountId);
  const retentionOption = selectRetentionOptionForPlan(
    canonicalPlan,
    existingSetting?.option_id
  );
  await upsertRetentionSelection(db, {
    accountId,
    planCode: canonicalPlan,
    option: retentionOption,
  });
}

export async function syncTopUp(
  db: Client,
  payload: TopUpSyncPayload,
  verify?: {
    stripe: Stripe;
    customerId?: string | null;
  }
): Promise<{ created: boolean }> {
  const { accountId, topUpId, stripeInvoiceId } = payload;
  if (!accountId || !topUpId || !stripeInvoiceId) {
    throw new Error('Missing fields for top-up sync');
  }

  await ensureBillingTables(db);

  const topUp = findTopUp(topUpId);
  if (!topUp && typeof payload.minutesGranted !== 'number') {
    throw new Error(`Unknown topUpId ${topUpId}`);
  }

  if (verify?.stripe && payload.stripePaymentIntentId) {
    const intent = await verify.stripe.paymentIntents.retrieve(
      payload.stripePaymentIntentId
    );
    if (!intent || (intent.customer && verify.customerId && intent.customer !== verify.customerId)) {
      throw new Error('PaymentIntent does not belong to this account');
    }
    if (intent.status !== 'succeeded' && intent.status !== 'requires_capture') {
      throw new Error('PaymentIntent is not complete');
    }
  }

  const planRow = await fetchAccountPlan(db, accountId);
  if (!planRow) {
    throw new Error('Account has no plan assignment');
  }

  const period = currentPeriod(planRow.timezone, planRow.renew_day);
  const minutes =
    typeof payload.minutesGranted === 'number'
      ? payload.minutesGranted
      : (topUp?.minutesGranted ?? 0);
  const msGranted = minutesToMs(minutes);
  if (msGranted <= 0) {
    throw new Error('Top-up has zero minutes');
  }

  const insertResult = await db.execute(
    `INSERT OR IGNORE INTO mobile_topups
       (stripe_invoice_id, account_id, top_up_id, ms_granted, minutes_granted, stripe_payment_intent_id, credited_period_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      stripeInvoiceId,
      accountId,
      topUpId,
      msGranted,
      minutes,
      payload.stripePaymentIntentId ?? null,
      period.periodId,
    ]
  );

  return { created: insertResult.rowsAffected > 0 };
}

export async function findAccountIdByCustomerId(
  db: Client,
  stripeCustomerId: string
): Promise<string | null> {
  await ensureBillingTables(db);
  const res = await db.execute(
    `SELECT account_id FROM mobile_customers WHERE stripe_customer_id = ? LIMIT 1`,
    [stripeCustomerId]
  );
  const accountId = (res.rows[0] as any)?.account_id;
  return accountId ? String(accountId) : null;
}

export function minutesToHuman(minutes: number): string {
  if (minutes >= 60) {
    const hours = minutes / 60;
    if (Number.isInteger(hours)) {
      return `${hours} uur`;
    }
    return `${hours.toFixed(1)} uur`;
  }
  return `${minutes} minuten`;
}
