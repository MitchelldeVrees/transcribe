import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  // Just attempt to decode token so NextAuth can initialize
  await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!.+\\.[\\w]+$|_next).*)',
    '/',
    '/api/(.*)',
    '/transcripts/(.*)',
  ],
};
