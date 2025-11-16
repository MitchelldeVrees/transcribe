import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';
import { signAccess, signRefresh } from '@/lib/jwt';
import { ensurePasswordColumns } from '@/lib/user';
import {
  normalizeEmail,
  validateEmail,
  verifyPassword,
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

    if (!rawEmail || !password) {
      return jsonError('E-mail en wachtwoord zijn verplicht.', 400);
    }
    if (!validateEmail(rawEmail)) {
      return jsonError('Ongeldig e-mailadres.', 400);
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
    const row = existingRes.rows[0];
    const existing = row ? coerceDbUser(row) : undefined;

    if (!existing || !existing.passwordHash) {
      return jsonError('Onjuiste combinatie van e-mail en wachtwoord.', 401);
    }

    const isValid = await verifyPassword(password, existing.passwordHash);
    if (!isValid) {
      return jsonError('Onjuiste combinatie van e-mail en wachtwoord.', 401);
    }

    const canonicalEmail = (existing.email || rawEmail).trim();
    const user = toUserPayload({
      ...existing,
      email: canonicalEmail,
    });
    const token = await signAccess(existing.subId, { email: canonicalEmail, name: user.name });
    const refreshToken = await signRefresh(existing.subId, { email: canonicalEmail, name: user.name });

    return NextResponse.json({ token, refreshToken, user });
  } catch (err) {
    console.error('/api/mobileBackend/auth/login error:', err);
    return jsonError('Interne fout op de server.', 500);
  }
}
