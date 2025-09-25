// src/app/api/mobileBackend/auth/refresh/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { signAccess, signRefresh } from '@/lib/jwt';

// same secret that jwt.ts uses
const SECRET = new TextEncoder().encode(process.env.BACKEND_JWT_SECRET!);

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const refreshToken = String(body.refreshToken || body.rt || '');

    if (!refreshToken) return err('Missing refreshToken', 400);

    // 1) Verify the refresh token
    const { payload } = await jwtVerify(refreshToken, SECRET);
    const typ = (payload as any).typ;
    if (typ !== 'refresh') return err('Invalid token type', 401);

    const sub = String(payload.sub || '');
    const email = typeof (payload as any).email === 'string' ? (payload as any).email : '';

    if (!sub) return err('Invalid token payload', 401);

    // 2) Issue new pair (rotate refresh!)
    const token = await signAccess(sub, { email }, '1h');   // access token lifetime
    const newRefresh = await signRefresh(sub, { email }, '30d'); // 30 days

    return NextResponse.json({ token, refreshToken: newRefresh });
  } catch (e: any) {
    const msg = String(e?.message || e);
    const isJwt = /JWT|exp|signature|audience|issuer|Invalid/i.test(msg);
    return err(isJwt ? 'Unauthorized' : 'Internal Server Error', isJwt ? 401 : 500);
  }
}
