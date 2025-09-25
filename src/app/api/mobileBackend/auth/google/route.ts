// src/app/api/mobileBackend/auth/google/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, createRemoteJWKSet, type JWTPayload } from 'jose';
import { getTursoClient } from '@/lib/turso';
import { generateReferralCode } from '@/lib/referral';
import { signAccess, signRefresh } from '@/lib/jwt';

// ---- Config (env) ----
// If you verify multiple audiences (iOS, Android, Web) put all here:
const CLIENT_IDS = [
  process.env.GOOGLE_CLIENT_ID_IOS!,
  process.env.GOOGLE_CLIENT_ID_MOBILE!,
  process.env.GOOGLE_CLIENT_ID_WEB!, // optional if you allow web too
].filter(Boolean);

// For code exchange flow (Option B) you need client secret(s) for the
// *corresponding* client IDs you’ll exchange against (usually the Web client):
const GOOGLE_OAUTH_CLIENT_ID     = process.env.GOOGLE_OAUTH_CLIENT_ID;     // e.g. Web client ID
const GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET; // Web client secret

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs')
);

// DB value type (keep edge-friendly)
type DBValue = string | number | bigint | boolean | null | Uint8Array;

type GoogleIdPayload = JWTPayload & {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
};

function assertGooglePayload(p: JWTPayload): asserts p is GoogleIdPayload {
  if (typeof (p as any).sub !== 'string') throw new Error('Invalid Google token: sub');
  if (typeof (p as any).email !== 'string') throw new Error('Invalid Google token: email');
}

// ---- Option B helper: server-side code exchange ----
async function exchangeCodeForTokens(args: {
  code: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string; // must exactly match what the client used
}) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: args.code,
      client_id: args.client_id,
      client_secret: args.client_secret,
      redirect_uri: args.redirect_uri,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google token exchange failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<{
    id_token: string;
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
    token_type?: string;
  }>;
}

// Optional: If you want to validate the redirect URI you expect from mobile clients.
// Your client log showed: luisterslim://oauth2redirect/google
function isAllowedRedirectUri(uri: string) {
  return uri === 'luisterslim://oauth2redirect/google';
  // add others if you also support web/dev proxies:
  // || uri.startsWith('exp://') || uri.startsWith('https://auth.expo.io/') ...
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) || {};
    // Client may send *either* an idToken directly (Option A)
    // OR a code + redirectUri (Option B)
    let idToken: string | undefined = body.idToken;

    if (!idToken && body.code) {
      // ---- Option B path ----
      const code = String(body.code);
      const redirectUri = String(body.redirectUri || '');
      if (!redirectUri || !isAllowedRedirectUri(redirectUri)) {
        return NextResponse.json({ error: 'Invalid redirectUri' }, { status: 400 });
      }
      if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET) {
        return NextResponse.json(
          { error: 'Server misconfigured: GOOGLE_OAUTH_CLIENT_ID/SECRET' },
          { status: 500 }
        );
      }

      const tokens = await exchangeCodeForTokens({
        code,
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
        redirect_uri: redirectUri,
      });

      idToken = tokens.id_token;
    }

    if (!idToken) {
      return NextResponse.json(
        { error: 'Missing idToken or code' },
        { status: 400 }
      );
    }

    // 1) Verify Google ID token (supports multiple audiences)
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      audience: CLIENT_IDS.length ? CLIENT_IDS : undefined,
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
    });
    assertGooglePayload(payload);

    const sub: string = payload.sub;
    const email: string = payload.email;
    const name: string = typeof payload.name === 'string' ? payload.name : '';

    const googlePic = typeof payload.picture === 'string' ? payload.picture : null;
    const fallbackIdx = Math.floor(Math.random() * 20) + 1; // 1..20
    const picture: string | null = fallbackIdx.toString();

    const createdISO: string = new Date().toISOString();
    const db = getTursoClient();

    // 2) Find existing user
    const existing = await db.execute(
      `SELECT subId, email, name, avatar, referralCode
         FROM users
        WHERE subId = ?
        LIMIT 1`,
      [sub] as DBValue[]
    );

    let referralCode: string;

    if ((existing as any).rows?.length === 0) {
      // ---- New user: create and attach default plan
      referralCode = generateReferralCode(email);

      await db.execute(
        `INSERT INTO users (subId, email, name, avatar, created, referralCode)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [sub, email, name, picture, createdISO, referralCode] as DBValue[]
      );

      // Attach default plan from catalog ('free'); fall back to 10h if plans table is empty
      const attachRes = await db.execute(
        `INSERT INTO user_plans (subId, plan_code, monthly_quota_ms, renew_day, timezone, started_at)
         SELECT ?, p.code, p.monthly_quota_ms, 1, ?, ?
           FROM plans p
          WHERE p.code = 'free'`,
        [sub, 'UTC', createdISO] as DBValue[]
      );

      if ((attachRes as any).rowsAffected === 0) {
        // Fallback: no 'plans' row found — hardcode 10h
        await db.execute(
          `INSERT INTO user_plans (subId, plan_code, monthly_quota_ms, renew_day, timezone, started_at)
           VALUES (?, 'free', ?, 1, ?, ?)`,
          [sub, 10 * 60 * 60 * 1000, 'UTC', createdISO] as DBValue[]
        );
      }
    } else {
      // ---- Existing user: keep data fresh
      const row = (existing as any).rows[0] as any;
      referralCode = row.referralCode as string;

      await db.execute(
        `UPDATE users
            SET email = ?, name = ?
          WHERE subId = ?`,
        [email, name, sub] as DBValue[]
      );

      // Safety net: ensure they have a user_plans row (legacy accounts, etc.)
      const planCheck = await db.execute(
        `SELECT 1 FROM user_plans WHERE subId = ? LIMIT 1`,
        [sub] as DBValue[]
      );
      if ((planCheck as any).rows?.length === 0) {
        const attachRes = await db.execute(
          `INSERT INTO user_plans (subId, plan_code, monthly_quota_ms, renew_day, timezone, started_at)
           SELECT ?, p.code, p.monthly_quota_ms, 1, ?, ?
             FROM plans p
            WHERE p.code = 'free'`,
          [sub, 'UTC', createdISO] as DBValue[]
        );
        if ((attachRes as any).rowsAffected === 0) {
          await db.execute(
            `INSERT INTO user_plans (subId, plan_code, monthly_quota_ms, renew_day, timezone, started_at)
             VALUES (?, 'free', ?, 1, ?, ?)`,
            [sub, 10 * 60 * 60 * 1000, 'UTC', createdISO] as DBValue[]
          );
        }
      }
    }

    // 3) Reload canonical user shape for client
    const fresh = await db.execute(
      `SELECT subId AS id, email, name, avatar, referralCode
         FROM users
        WHERE subId = ?`,
      [sub] as DBValue[]
    );

    const user = (fresh as any).rows[0] as {
      id: string;
      email: string;
      name: string;
      avatar: string | null;
      referralCode: string;
    };

    // 4) Issue tokens: short-lived access + long-lived refresh
    const token = await signAccess(user.id, { email });
    const refreshToken = await signRefresh(user.id, { email });

    return NextResponse.json({ token, refreshToken, user });
  } catch (err: any) {
    console.error('[/api/mobileBackend/auth/google] error:', err);
    const msg = String(err?.message || err);
    const isAuthError =
      msg.includes('Invalid Google token') ||
      msg.includes('audience') ||
      msg.includes('issuer') ||
      msg.includes('exp') ||
      msg.includes('signature') ||
      msg.includes('JWT');
    return NextResponse.json(
      { error: isAuthError ? 'Unauthorized' : 'Internal Server Error' },
      { status: isAuthError ? 401 : 500 }
    );
  }
}

// If you’re on Next.js App Router and want edge runtime:
// export const runtime = 'edge';
