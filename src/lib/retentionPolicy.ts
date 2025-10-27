import type { Client } from '@libsql/client/web';

export type PlanInfo = {
  code: string;
  name: string;
  description?: string;
};

export type CanonicalPlanCode = 'free' | 'basic' | 'premium';

export type RetentionOption = {
  id: string;
  label: string;
  days: number;
  description?: string;
  planCodes: CanonicalPlanCode[];
};

export type RetentionSettingRow = {
  account_id: string;
  plan_code: string;
  option_id: string;
  retention_days: number;
  updated_at: string | null;
  last_deletion_at: string | null;
  next_deletion_at: string | null;
  next_deletion_count: number | null;
  deletion_window_days: number | null;
  audit_report_url: string | null;
};

export type RetentionAuditLogEntry = {
  id: string;
  account_id: string;
  run_at: string;
  deleted_transcripts: number;
  deleted_attachments: number;
  retention_days: number;
  actor: string;
  notes: string | null;
  report_url: string | null;
};

const PLAN_CATALOG: Record<string, PlanInfo> = {
  free:        { code: 'free',        name: 'Free' },
  starter:     { code: 'starter',     name: 'Starter' },
  pro:         { code: 'pro',         name: 'Pro' },
  team:        { code: 'team',        name: 'Team' },
  enterprise:  { code: 'enterprise',  name: 'Enterprise' },
  basic:       { code: 'basic',       name: 'Basic' },
  premium:     { code: 'premium',     name: 'Premium' },
};

const CANONICAL_PLAN_NAMES: Record<CanonicalPlanCode, string> = {
  free: 'Free',
  basic: 'Basic',
  premium: 'Premium',
};

const PLAN_CANONICAL_MAP: Record<string, CanonicalPlanCode> = {
  free: 'free',
  starter: 'basic',
  basic: 'basic',
  pro: 'premium',
  premium: 'premium',
  team: 'premium',
  enterprise: 'premium',
};

const DEFAULT_PLAN = PLAN_CATALOG.free;

export const RETENTION_OPTIONS: RetentionOption[] = [
  {
    id: '30d',
    label: '30 dagen',
    days: 30,
    description: 'Standaard-herinnering van 30 dagen voor elk account.',
    planCodes: ['free', 'basic', 'premium'],
  },
  {
    id: '90d',
    label: '90 dagen',
    days: 90,
    description: 'Bewaar transcripts voor een kwartaal voor audits.',
    planCodes: ['basic', 'premium'],
  },
  {
    id: '180d',
    label: '180 dagen',
    days: 180,
    description: 'Halve-jaar retention voor teams met langere projecten.',
    planCodes: ['basic', 'premium'],
  },
  {
    id: '365d',
    label: '365 dagen',
    days: 365,
    description: 'Volledig jaar archief (vereist Premium-plan).',
    planCodes: ['premium'],
  },
];

let tablesEnsured = false;

export function resolvePlanInfo(code?: string | null): PlanInfo {
  const normalized = String(code || '').trim().toLowerCase();
  if (!normalized) return DEFAULT_PLAN;
  return PLAN_CATALOG[normalized] ?? PLAN_CATALOG[toCanonicalPlanCode(normalized)] ?? {
    code: normalized,
    name: normalized.charAt(0).toUpperCase() + normalized.slice(1),
  };
}

export function toCanonicalPlanCode(code?: string | null): CanonicalPlanCode {
  const normalized = String(code || '').trim().toLowerCase();
  if (!normalized) return 'free';
  return PLAN_CANONICAL_MAP[normalized] ?? 'free';
}

export function canonicalPlanName(code: CanonicalPlanCode): string {
  return CANONICAL_PLAN_NAMES[code];
}

export function findRetentionOption(optionId?: string | null): RetentionOption | undefined {
  if (!optionId) return undefined;
  return RETENTION_OPTIONS.find((opt) => opt.id === optionId);
}

export function defaultRetentionOption(planCode?: string | null): RetentionOption {
  const canonical = toCanonicalPlanCode(planCode);
  const allowed = RETENTION_OPTIONS.filter((opt) => opt.planCodes.includes(canonical));
  if (!allowed.length) return RETENTION_OPTIONS[0];
  return allowed.sort((a, b) => a.days - b.days)[0];
}

export function optionLockedForPlan(option: RetentionOption, planCode?: string | null): boolean {
  const canonical = toCanonicalPlanCode(planCode);
  return !option.planCodes.includes(canonical);
}

export function selectRetentionOptionForPlan(
  planCode: string | null | undefined,
  preferredOptionId?: string | null
): RetentionOption {
  const canonical = toCanonicalPlanCode(planCode);
  const allowed = RETENTION_OPTIONS
    .filter((opt) => opt.planCodes.includes(canonical))
    .sort((a, b) => a.days - b.days);
  if (!allowed.length) {
    return RETENTION_OPTIONS[0];
  }

  if (preferredOptionId) {
    const preferred = findRetentionOption(preferredOptionId);
    if (preferred && !optionLockedForPlan(preferred, canonical)) {
      return preferred;
    }
    if (preferred) {
      for (let i = allowed.length - 1; i >= 0; i -= 1) {
        if (allowed[i].days <= preferred.days) {
          return allowed[i];
        }
      }
    }
  }

  return allowed[0];
}

export async function ensureRetentionTables(db: Client) {
  if (!tablesEnsured) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_retention_settings (
        account_id TEXT PRIMARY KEY,
        plan_code TEXT NOT NULL,
        option_id TEXT NOT NULL,
        retention_days INTEGER NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')),
        last_deletion_at TEXT,
        next_deletion_at TEXT,
        next_deletion_count INTEGER,
        deletion_window_days INTEGER,
        audit_report_url TEXT
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS retention_audit_log (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        run_at TEXT NOT NULL,
        deleted_transcripts INTEGER NOT NULL,
        deleted_attachments INTEGER NOT NULL,
        retention_days INTEGER NOT NULL,
        actor TEXT NOT NULL,
        notes TEXT,
        report_url TEXT
      )
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_retention_audit_account_run
      ON retention_audit_log (account_id, run_at DESC)
    `);
    tablesEnsured = true;
  }
}

function mapSettingRow(row: any | undefined): RetentionSettingRow | null {
  if (!row) return null;
  return {
    account_id: String(row.account_id ?? row.accountId ?? ''),
    plan_code: toCanonicalPlanCode(row.plan_code ?? row.planCode ?? 'free'),
    option_id: String(row.option_id ?? row.optionId ?? ''),
    retention_days: Number(row.retention_days ?? row.retentionDays ?? 0),
    updated_at: row.updated_at ?? row.updatedAt ?? null,
    last_deletion_at: row.last_deletion_at ?? row.lastDeletionAt ?? null,
    next_deletion_at: row.next_deletion_at ?? row.nextDeletionAt ?? null,
    next_deletion_count: row.next_deletion_count ?? row.nextDeletionCount ?? null,
    deletion_window_days: row.deletion_window_days ?? row.deletionWindowDays ?? null,
    audit_report_url: row.audit_report_url ?? row.auditReportUrl ?? null,
  };
}

function mapAuditRow(row: any): RetentionAuditLogEntry {
  return {
    id: String(row.id),
    account_id: String(row.account_id ?? ''),
    run_at: String(row.run_at ?? ''),
    deleted_transcripts: Number(row.deleted_transcripts ?? 0),
    deleted_attachments: Number(row.deleted_attachments ?? 0),
    retention_days: Number(row.retention_days ?? 0),
    actor: String(row.actor ?? ''),
    notes: row.notes ?? null,
    report_url: row.report_url ?? null,
  };
}

export async function getRetentionSetting(db: Client, accountId: string): Promise<RetentionSettingRow | null> {
  await ensureRetentionTables(db);
  const res = await db.execute(
    `SELECT account_id, plan_code, option_id, retention_days, updated_at,
            last_deletion_at, next_deletion_at, next_deletion_count,
            deletion_window_days, audit_report_url
       FROM user_retention_settings
      WHERE account_id = ?
      LIMIT 1`,
    [accountId]
  );
  return mapSettingRow(res.rows[0]);
}

export async function ensureRetentionSetting(
  db: Client,
  accountId: string,
  planCode: string
): Promise<RetentionSettingRow> {
  const canonicalPlan = toCanonicalPlanCode(planCode);
  const existing = await getRetentionSetting(db, accountId);
  if (existing) return existing;
  const option = defaultRetentionOption(canonicalPlan);
  await db.execute(
    `INSERT INTO user_retention_settings
       (account_id, plan_code, option_id, retention_days, updated_at, deletion_window_days)
     VALUES (?, ?, ?, ?, STRFTIME('%Y-%m-%dT%H:%M:%fZ','now'), ?)`,
    [accountId, canonicalPlan, option.id, option.days, option.days]
  );
  return (await getRetentionSetting(db, accountId))!;
}

export async function upsertRetentionSelection(
  db: Client,
  params: { accountId: string; planCode: string; option: RetentionOption }
): Promise<RetentionSettingRow> {
  const canonicalPlan = toCanonicalPlanCode(params.planCode);
  await ensureRetentionTables(db);
  await db.execute(
    `INSERT INTO user_retention_settings
       (account_id, plan_code, option_id, retention_days, updated_at, deletion_window_days)
     VALUES (?, ?, ?, ?, STRFTIME('%Y-%m-%dT%H:%M:%fZ','now'), ?)
     ON CONFLICT(account_id)
     DO UPDATE SET
       option_id = excluded.option_id,
       plan_code = excluded.plan_code,
       retention_days = excluded.retention_days,
       updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ','now'),
       deletion_window_days = excluded.deletion_window_days`,
    [params.accountId, canonicalPlan, params.option.id, params.option.days, params.option.days]
  );
  return (await getRetentionSetting(db, params.accountId))!;
}

export async function fetchRetentionAuditLog(
  db: Client,
  accountId: string,
  limit = 25
): Promise<RetentionAuditLogEntry[]> {
  await ensureRetentionTables(db);
  const res = await db.execute(
    `SELECT id, account_id, run_at, deleted_transcripts, deleted_attachments,
            retention_days, actor, notes, report_url
       FROM retention_audit_log
      WHERE account_id = ?
      ORDER BY datetime(run_at) DESC
      LIMIT ?`,
    [accountId, limit]
  );
  return res.rows.map(mapAuditRow);
}

export async function recordRetentionAuditLog(
  db: Client,
  entry: RetentionAuditLogEntry
): Promise<void> {
  await ensureRetentionTables(db);
  await db.execute(
    `INSERT INTO retention_audit_log
       (id, account_id, run_at, deleted_transcripts, deleted_attachments,
        retention_days, actor, notes, report_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.account_id,
      entry.run_at,
      entry.deleted_transcripts,
      entry.deleted_attachments,
      entry.retention_days,
      entry.actor,
      entry.notes,
      entry.report_url,
    ]
  );
}

export async function updateSchedulerMetadata(
  db: Client,
  accountId: string,
  data: {
    lastDeletionAt?: string | null;
    nextDeletionAt?: string | null;
    nextDeletionCount?: number | null;
    deletionWindowDays?: number | null;
    auditReportUrl?: string | null;
  }
): Promise<void> {
  await ensureRetentionTables(db);
  const sets: string[] = [];
  const values: any[] = [];
  if (data.lastDeletionAt !== undefined) {
    sets.push('last_deletion_at = ?');
    values.push(data.lastDeletionAt);
  }
  if (data.nextDeletionAt !== undefined) {
    sets.push('next_deletion_at = ?');
    values.push(data.nextDeletionAt);
  }
  if (data.nextDeletionCount !== undefined) {
    sets.push('next_deletion_count = ?');
    values.push(data.nextDeletionCount);
  }
  if (data.deletionWindowDays !== undefined) {
    sets.push('deletion_window_days = ?');
    values.push(data.deletionWindowDays);
  }
  if (data.auditReportUrl !== undefined) {
    sets.push('audit_report_url = ?');
    values.push(data.auditReportUrl);
  }
  if (!sets.length) return;
  values.push(accountId);
  await db.execute(
    `UPDATE user_retention_settings
        SET ${sets.join(', ')}
      WHERE account_id = ?`,
    values
  );
}

export function optionPayloadForPlan(planCode: string) {
  const canonical = toCanonicalPlanCode(planCode);
  const defaultOption = defaultRetentionOption(canonical);
  return RETENTION_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
    days: option.days,
    description: option.description ?? null,
    planCodes: option.planCodes,
    locked: optionLockedForPlan(option, canonical),
    defaultForPlan: defaultOption.id === option.id,
  }));
}
