// src/lib/jwt.ts
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const RAW_SECRET = process.env.BACKEND_JWT_SECRET;
if (!RAW_SECRET) {
  throw new Error('Missing BACKEND_JWT_SECRET');
}
const secret = new TextEncoder().encode(RAW_SECRET);

// Defaults (tweak to taste)
export const ACCESS_TTL  = '30m';  // was '15m'
export const REFRESH_TTL = '30d';

// Small tolerance to absorb device/edge skew
const CLOCK_TOLERANCE = '90s';

// Helpers
function nowJti() {
  // monotonic-ish unique id; replace with uuid if you prefer
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type Extra = Record<string, any>;

export async function signAccess(sub: string, extra: Extra = {}, exp: string = ACCESS_TTL) {
  return await new SignJWT({ ...extra, typ: 'access', jti: nowJti() })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(sub)        // standard "sub" claim
    .setIssuedAt()          // iat in seconds (handled by jose)
    .setExpirationTime(exp) // duration string, e.g. '30m'
    .sign(secret);
}

export async function signRefresh(sub: string, extra: Extra = {}, exp: string = REFRESH_TTL) {
  return await new SignJWT({ ...extra, typ: 'refresh', jti: nowJti() })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret);
}

export async function verifyAccess(token: string) {
  const res = await jwtVerify(token, secret, {
    algorithms: ['HS256'],
    clockTolerance: CLOCK_TOLERANCE,
  });
  const payload = res.payload as JWTPayload & { typ?: string };
  if (payload.typ !== 'access') {
    throw new Error('Wrong token type (expected access)');
  }
  return res;
}

export async function verifyRefresh(token: string) {
  const res = await jwtVerify(token, secret, {
    algorithms: ['HS256'],
    clockTolerance: CLOCK_TOLERANCE,
  });
  const payload = res.payload as JWTPayload & { typ?: string };
  if (payload.typ !== 'refresh') {
    throw new Error('Wrong token type (expected refresh)');
  }
  return res;
}

/** Generic verify (kept for compatibility, but prefer verifyAccess/verifyRefresh) */
export async function verifyJwt(token: string) {
  return jwtVerify(token, secret, {
    algorithms: ['HS256'],
    clockTolerance: CLOCK_TOLERANCE,
  }); // throws on invalid/expired
}
