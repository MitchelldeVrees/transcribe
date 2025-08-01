// src/app/api/auth/google/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { SignJWT } from 'jose';
import { getTursoClient } from '@/lib/turso';
import { generateReferralCode } from '@/lib/referral';

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID_MOBILE!;
const JWT_SECRET    = new TextEncoder().encode(process.env.BACKEND_JWT_SECRET!);
const GOOGLE_CLIENT = new OAuth2Client(CLIENT_ID);

export async function POST(req: NextRequest) {
  try {
    // …verify Google token exactly as before…
    const { idToken } = await req.json();
    const ticket      = await GOOGLE_CLIENT.verifyIdToken({ idToken, audience: CLIENT_ID });
    const p           = ticket.getPayload()!;
    if (!p.sub || !p.email) throw new Error('Invalid Google token');

    const db = getTursoClient();
    console.log(p);
    // 1️⃣ See if the user already exists
    const existing = await db.execute(
      `SELECT subId, email, name, avatar, referralCode
         FROM users
        WHERE subId = ?
        LIMIT 1`,
      [p.sub]
    );

    let referralCode: string;
    if (existing.rows.length === 0) {
      // 🆕 First login: generate a referral code and insert
      referralCode = generateReferralCode(p.email);
      await db.execute(
        `INSERT INTO users (subId, email, name, avatar, created, referralCode)
           VALUES (?, ?, ?, ?, ?, ?)`,
        [p.sub, p.email, p.name ?? '', p.picture ?? null, new Date().toISOString(), referralCode]
      );
    } else {
      // 🔄 Returning user: keep their old referralCode
      const row = existing.rows[0] as any;
      referralCode = row.referralCode;

      // Optional: update email/name/avatar
      await db.execute(
        `UPDATE users
            SET email = ?, name = ?, avatar = ?
          WHERE subId = ?`,
        [p.email, p.name ?? '', p.picture ?? null, p.sub]
      );
    }

    // 2️⃣ Load the “full” record back (to return consistent fields)
    const fresh = await db.execute(
      `SELECT subId AS id, email, name, avatar, referralCode
         FROM users
        WHERE subId = ?`,
      [p.sub]
    );
    const user = fresh.rows[0] as any;

    // 3️⃣ Sign your own JWT
    const token = await new SignJWT({ sub: user.id, email: user.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(JWT_SECRET);

      

    return NextResponse.json({ token, user });
  } catch (err: any) {
    console.error('[/api/auth/google] error:', err);
    const isAuthError = err.message?.includes('token');
    return NextResponse.json(
      { error: isAuthError ? 'Unauthorized' : 'Internal Server Error' },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
