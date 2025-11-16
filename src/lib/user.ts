import type { Client } from '@libsql/client/web';

let referralPromptColumnEnsured = false;

export async function ensureReferralPromptColumn(db: Client) {
  if (referralPromptColumnEnsured) {
    return;
  }

  const columns = await db.execute(`PRAGMA table_info(users)`);
  const hasColumn = columns.rows.some((row: any) => {
    const name = row?.name ?? row?.column_name;
    return typeof name === 'string' && name.toLowerCase() === 'needsreferralprompt';
  });

  if (!hasColumn) {
    await db.execute(
      `ALTER TABLE users
         ADD COLUMN needsReferralPrompt INTEGER NOT NULL DEFAULT 0`
    );
  }

  referralPromptColumnEnsured = true;
}
