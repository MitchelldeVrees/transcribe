import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  // 1) Force canonical host to avoid cookie/same-site and PKCE issues
  const url = new URL(req.url);
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && url.hostname === 'luisterslim.nl') {
    url.hostname = 'www.luisterslim.nl';
    return NextResponse.redirect(url, 308);
  }

  // 2) Touch next-auth JWT so it initializes in middleware (optional)
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (secret) {
    await getToken({ req, secret });
  }
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
