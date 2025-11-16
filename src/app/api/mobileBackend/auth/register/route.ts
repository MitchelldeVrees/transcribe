import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';
import { ensureDefaultPlan } from '@/lib/plans';
import { generateReferralCode } from '@/lib/referral';
import { signAccess, signRefresh } from '@/lib/jwt';
import { ensurePasswordColumns } from '@/lib/user';
import {
  hashPassword,
  normalizeEmail,
  validateEmail,
  validatePasswordStrength,
} from '@/lib/password';

type DbUserRow = {
  subId: string;
  email: string;
  name: string | null;
  avatar: string | null;
  referralCode: string | null;
  passwordHash?: string | null;
};

function coerceDbUser(row: any): DbUserRow {
  return {
    subId: String(row?.subId ?? ''),
    email: typeof row?.email === 'string' ? row.email : '',
    name: typeof row?.name === 'string' ? row.name : null,
    avatar: typeof row?.avatar === 'string' ? row.avatar : null,
    referralCode: typeof row?.referralCode === 'string' ? row.referralCode : null,
    passwordHash: typeof row?.passwordHash === 'string' ? row.passwordHash : null,
  };
}

function toUserPayload(row: DbUserRow) {
  return {
    id: row.subId,
    email: row.email,
    name: row.name ?? row.email,
    avatar: row.avatar,
    referralCode: row.referralCode,
  };
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return jsonError('Ongeldig verzoek.', 400);
    }

    const rawEmail = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const nameInput = typeof body.name === 'string' ? body.name.trim() : '';

    if (!rawEmail || !password) {
      return jsonError('E-mail en wachtwoord zijn verplicht.', 400);
    }
    if (!validateEmail(rawEmail)) {
      return jsonError('Ongeldig e-mailadres.', 400);
    }

    const passwordIssue = validatePasswordStrength(password);
    if (passwordIssue) {
      return jsonError(passwordIssue, 400);
    }

    const lookupEmail = normalizeEmail(rawEmail);
    const db = getTursoClient();
    await ensurePasswordColumns(db);

    const existingRes = await db.execute(
      `SELECT subId, email, name, avatar, referralCode, passwordHash
         FROM users
        WHERE LOWER(email) = ?
        LIMIT 1`,
      [lookupEmail]
    );
    const existingRow = existingRes.rows[0];
    const existing = existingRow ? coerceDbUser(existingRow) : undefined;

    const nowIso = new Date().toISOString();
    let activeRow: DbUserRow;

    if (existing) {
      if (existing.passwordHash) {
        return jsonError('Er bestaat al een account met dit e-mailadres.', 409);
      }

      const hashed = await hashPassword(password);
      const nextName = nameInput || existing.name || rawEmail.split('@')[0];
      let referralCode = existing.referralCode;
      if (!referralCode) {
        referralCode = generateReferralCode(rawEmail);
        await db.execute(
          `UPDATE users
              SET referralCode = ?
            WHERE subId = ?`,
          [referralCode, existing.subId]
        );
      }

      await db.execute(
        `UPDATE users
            SET passwordHash = ?,
                passwordUpdated = ?,
                name = ?,
                email = ?
          WHERE subId = ?`,
        [hashed, nowIso, nextName, rawEmail, existing.subId]
      );

      await ensureDefaultPlan(db, existing.subId, nowIso);

      activeRow = {
        ...existing,
        passwordHash: hashed,
        email: rawEmail,
        name: nextName,
        referralCode,
      };
    } else {
      const hashed = await hashPassword(password);
      const subId = `local:${randomUUID()}`;
      const nextName = nameInput || rawEmail.split('@')[0];
      const referralCode = generateReferralCode(rawEmail);

      await db.execute(
        `INSERT INTO users (subId, email, name, avatar, created, referralCode, passwordHash, passwordUpdated)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
        [subId, rawEmail, nextName, nowIso, referralCode, hashed, nowIso]
      );
      await ensureDefaultPlan(db, subId, nowIso);

      activeRow = {
        subId,
        email: rawEmail,
        name: nextName,
        avatar: null,
        referralCode,
        passwordHash: hashed,
      };
    }

    const user = toUserPayload(activeRow);
    const token = await signAccess(activeRow.subId, { email: user.email, name: user.name });
    const refreshToken = await signRefresh(activeRow.subId, { email: user.email, name: user.name });

    return NextResponse.json(
      { token, refreshToken, user },
      { status: existing ? 200 : 201 }
    );
  } catch (err) {
    console.error('/api/mobileBackend/auth/register error:', err);
    return jsonError('Interne fout op de server.', 500);
  }
}
