import { randomUUID } from 'crypto';
import { getTursoClient } from '@/lib/turso';
import {
  defaultRetentionOption,
  ensureRetentionSetting,
  ensureRetentionTables,
  recordRetentionAuditLog,
  resolvePlanInfo,
  RetentionSettingRow,
  updateSchedulerMetadata,
} from '@/lib/retentionPolicy';

const DAY_MS = 24 * 60 * 60 * 1000;

type CronResult = {
  accountsProcessed: number;
  totalTranscriptsDeleted: number;
  totalAttachmentsDeleted: number;
};

export async function runRetentionCron(now = new Date()): Promise<CronResult> {
  const db = getTursoClient();
  await ensureRetentionTables(db);

  const accountsRes = await db.execute(
    `SELECT DISTINCT account_id, plan_code
       FROM (
             SELECT subId AS account_id, plan_code FROM user_plans
             UNION
             SELECT account_id, plan_code FROM user_retention_settings
       )
      WHERE account_id IS NOT NULL`
  );

  let totalTranscriptsDeleted = 0;
  let totalAttachmentsDeleted = 0;

  for (const row of accountsRes.rows as any[]) {
    const accountId = normalizeAccountId(row);
    if (!accountId) continue;

    const planCode = String(row.plan_code || 'free');
    const plan = resolvePlanInfo(planCode);
    const setting = await ensureRetentionSetting(db, accountId, plan.code);
    const retentionDays = normalizeRetentionDays(setting, plan.code);
    if (retentionDays <= 0) {
      await updateSchedulerMetadata(db, accountId, {
        nextDeletionAt: null,
        nextDeletionCount: 0,
        deletionWindowDays: 0,
      });
      continue;
    }

    const runAtIso = now.toISOString();
    const cutoffIso = new Date(now.getTime() - retentionDays * DAY_MS).toISOString();

    const transcriptIds = await collectIds(
      db,
      `SELECT id FROM transcripts WHERE subId = ? AND datetime(created) < datetime(?)`,
      [accountId, cutoffIso]
    );
    const deletedTranscripts = transcriptIds.length;
    if (deletedTranscripts) {
      await db.execute(
        `DELETE FROM transcripts
          WHERE subId = ? AND datetime(created) < datetime(?)`,
        [accountId, cutoffIso]
      );
      await deleteUsageEventsForTranscripts(db, accountId, transcriptIds);
    }

    const jobIds = await collectIds(
      db,
      `SELECT id
         FROM transcribe_jobs
        WHERE subId = ?
          AND updated_at IS NOT NULL
          AND datetime(updated_at) < datetime(?)`,
      [accountId, cutoffIso]
    );
    const deletedAttachments = jobIds.length;
    if (deletedAttachments) {
      await deleteJobsByIds(db, accountId, jobIds);
    }

    totalTranscriptsDeleted += deletedTranscripts;
    totalAttachmentsDeleted += deletedAttachments;

    const notes = `Retention window ${retentionDays}d | cutoff ${cutoffIso}`;
    await recordRetentionAuditLog(db, {
      id: randomUUID(),
      account_id: accountId,
      run_at: runAtIso,
      deleted_transcripts: deletedTranscripts,
      deleted_attachments: deletedAttachments,
      retention_days: retentionDays,
      actor: 'system:retention-cron',
      notes,
      report_url: null,
    });

    const nextRun = new Date(now.getTime() + DAY_MS);
    const nextCutoff = new Date(nextRun.getTime() - retentionDays * DAY_MS).toISOString();
    const nextDeletionCount = await countUpcomingDeletes(db, accountId, nextCutoff);

    await updateSchedulerMetadata(db, accountId, {
      lastDeletionAt: runAtIso,
      nextDeletionAt: nextRun.toISOString(),
      nextDeletionCount,
      deletionWindowDays: retentionDays,
    });
  }

  return {
    accountsProcessed: accountsRes.rows.length,
    totalTranscriptsDeleted,
    totalAttachmentsDeleted,
  };
}

function normalizeAccountId(row: any): string | null {
  return (
    row?.account_id ??
    row?.accountId ??
    row?.subId ??
    row?.subid ??
    row?.sub_id ??
    null
  );
}

function normalizeRetentionDays(setting: RetentionSettingRow, planCode: string): number {
  const fromSetting = Number(setting.retention_days || 0);
  if (fromSetting > 0) return fromSetting;
  return defaultRetentionOption(planCode).days;
}

async function collectIds(
  db: ReturnType<typeof getTursoClient>,
  query: string,
  params: (string | number)[]
): Promise<string[]> {
  const res = await db.execute(query, params);
  return res.rows.map((row: any) => String(row.id)).filter(Boolean);
}

async function deleteUsageEventsForTranscripts(
  db: ReturnType<typeof getTursoClient>,
  accountId: string,
  transcriptIds: string[]
) {
  const chunkSize = 50;
  for (let i = 0; i < transcriptIds.length; i += chunkSize) {
    const chunk = transcriptIds.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => '?').join(', ');
    await db.execute(
      `DELETE FROM usage_events
         WHERE subId = ?
           AND transcript_id IN (${placeholders})`,
      [accountId, ...chunk]
    );
  }
}

async function deleteJobsByIds(
  db: ReturnType<typeof getTursoClient>,
  accountId: string,
  jobIds: string[]
) {
  const chunkSize = 50;
  for (let i = 0; i < jobIds.length; i += chunkSize) {
    const chunk = jobIds.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => '?').join(', ');
    await db.execute(
      `DELETE FROM transcribe_jobs
         WHERE subId = ?
           AND id IN (${placeholders})`,
      [accountId, ...chunk]
    );
  }
}

async function countUpcomingDeletes(
  db: ReturnType<typeof getTursoClient>,
  accountId: string,
  nextCutoffIso: string
): Promise<number> {
  const res = await db.execute(
    `SELECT COUNT(1) AS cnt
       FROM transcripts
      WHERE subId = ? AND datetime(created) < datetime(?)`,
    [accountId, nextCutoffIso]
  );
  return Number((res.rows[0] as any)?.cnt ?? 0);
}

if (process.argv[1]?.includes('retentionCron')) {
  runRetentionCron()
    .then((result) => {
      console.log('[retentionCron] completed', result);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[retentionCron] failed', err);
      process.exit(1);
    });
}
