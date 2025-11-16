import { NextRequest, NextResponse } from 'next/server';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { getTursoClient } from '@/lib/turso';
import { generateReferralCode } from '@/lib/referral';
import { ensureDefaultPlan } from '@/lib/plans';
import { signAccess, signRefresh } from '@/lib/jwt';

const APPLE_AUDIENCE =
  process.env.APPLE_SERVICE_ID ||
  process.env.APPLE_CLIENT_ID ||
  process.env.APPLE_BUNDLE_ID;

const APPLE_JWKS = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys')
);

type ApplePayload = JWTPayload & {
  sub: string;
  email?: string;
  email_verified?: string | boolean;
  is_private_email?: string | boolean;
};

function assertApplePayload(payload: JWTPayload): asserts payload is ApplePayload {
  if (typeof (payload as any).sub !== 'string') {
    throw new Error('Invalid Apple identity token: missing sub');
  }
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

    if (!APPLE_AUDIENCE) {
      console.error('Missing APPLE_SERVICE_ID / APPLE_CLIENT_ID env vars');
      return jsonError('Server niet geconfigureerd voor Apple login.', 500);
    }

    const identityToken = typeof body.identityToken === 'string' ? body.identityToken : '';
    const providedEmail =
      typeof body.email === 'string' ? body.email.trim() : '';
    const providedName =
      typeof body.fullName === 'string' ? body.fullName.trim() : '';

    if (!identityToken) {
      return jsonError('Ontbrekende identityToken.', 400);
    }

    const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
      audience: APPLE_AUDIENCE,
      issuer: 'https://appleid.apple.com',
    });
    assertApplePayload(payload);

    const appleSub = payload.sub;
    const subId = `apple:${appleSub}`;
    const emailFromToken =
      typeof payload.email === 'string' ? payload.email : null;

    const db = getTursoClient();
    const existingRes = await db.execute(
      `SELECT subId, email, name, avatar, referralCode
         FROM users
        WHERE subId = ?
        LIMIT 1`,
      [subId]
    );

    const existingRow = existingRes.rows[0];
    const existing = existingRow
      ? {
          subId: String(existingRow.subId ?? ''),
          email:
            typeof existingRow.email === 'string' ? existingRow.email : null,
          name: typeof existingRow.name === 'string' ? existingRow.name : null,
          avatar:
            typeof existingRow.avatar === 'string' ? existingRow.avatar : null,
          referralCode:
            typeof existingRow.referralCode === 'string'
              ? existingRow.referralCode
              : null,
        }
      : undefined;

    const finalEmail = emailFromToken || providedEmail || existing?.email || null;

    if (!finalEmail) {
      return jsonError(
        'Apple gaf geen e-mailadres terug. Log uit Apple en probeer opnieuw.',
        400
      );
    }

    const displayName =
      providedName || existing?.name || finalEmail.split('@')[0];
    const createdISO = new Date().toISOString();
    let referralCode = existing?.referralCode ?? null;

    if (!existing) {
      if (!referralCode) {
        referralCode = generateReferralCode(finalEmail);
      }

      await db.execute(
        `INSERT INTO users (subId, email, name, avatar, created, referralCode)
         VALUES (?, ?, ?, NULL, ?, ?)`,
        [subId, finalEmail, displayName, createdISO, referralCode]
      );
      await ensureDefaultPlan(db, subId, createdISO);
    } else {
      await db.execute(
        `UPDATE users
            SET email = ?,
                name = ?
          WHERE subId = ?`,
        [finalEmail, displayName, subId]
      );
      if (!referralCode) {
        referralCode = generateReferralCode(finalEmail);
        await db.execute(
          `UPDATE users
              SET referralCode = ?
            WHERE subId = ?`,
          [referralCode, subId]
        );
      }
    }

    const fresh = await db.execute(
      `SELECT subId AS id, email, name, avatar, referralCode
         FROM users
        WHERE subId = ?
        LIMIT 1`,
      [subId]
    );

    const userRow = fresh.rows[0] || {};
    const user = {
      id: String(userRow.id ?? userRow.subId ?? subId),
      email: String(userRow.email ?? finalEmail),
      name: String(userRow.name ?? displayName),
      avatar: typeof userRow.avatar === 'string' ? userRow.avatar : null,
      referralCode:
        typeof userRow.referralCode === 'string'
          ? userRow.referralCode
          : referralCode,
    };

    const token = await signAccess(user.id, { email: user.email, name: user.name });
    const refreshToken = await signRefresh(user.id, { email: user.email, name: user.name });

    return NextResponse.json({ token, refreshToken, user });
  } catch (err: any) {
    console.error('[/api/mobileBackend/auth/apple] error:', err);
    const msg = String(err?.message || err || '');
    const isAuth =
      msg.includes('Invalid Apple identity token') ||
      msg.includes('identityToken') ||
      msg.includes('audience') ||
      msg.includes('issuer');
    return jsonError(isAuth ? 'Unauthorized' : 'Internal Server Error', isAuth ? 401 : 500);
  }
}
