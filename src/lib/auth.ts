// src/lib/auth.ts
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.BACKEND_JWT_SECRET!);

export async function requireAuth(headers: Headers) {
  const auth = headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('No token');
  const { payload } = await jwtVerify(token, secret);
  return payload;
}
