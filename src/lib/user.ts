import type { Client } from '@libsql/client/web';

let referralPromptColumnEnsured = false;
let passwordColumnEnsured = false;

function columnName(row: any) {
  const name = row?.name ?? row?.column_name ?? '';
  return typeof name === 'string' ? name.toLowerCase() : '';
}

export async function ensureReferralPromptColumn(db: Client) {
  if (referralPromptColumnEnsured) {
    return;
  }

  const columns = await db.execute(`PRAGMA table_info(users)`);
  const hasColumn = columns.rows.some((row: any) => columnName(row) === 'needsreferralprompt');

  if (!hasColumn) {
    await db.execute(
      `ALTER TABLE users
         ADD COLUMN needsReferralPrompt INTEGER NOT NULL DEFAULT 0`
    );
  }

  referralPromptColumnEnsured = true;
}

export async function ensurePasswordColumns(db: Client) {
  if (passwordColumnEnsured) {
    return;
  }

  const columns = await db.execute(`PRAGMA table_info(users)`);
  const names = columns.rows.map(columnName);

  if (!names.includes('passwordhash')) {
    await db.execute(
      `ALTER TABLE users
         ADD COLUMN passwordHash TEXT`
    );
  }

  if (!names.includes('passwordupdated')) {
    await db.execute(
      `ALTER TABLE users
         ADD COLUMN passwordUpdated TEXT`
    );
  }

  passwordColumnEnsured = true;
}
