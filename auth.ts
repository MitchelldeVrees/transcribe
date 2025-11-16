// auth.ts  (project root, not in src/)
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { SignJWT,decodeJwt } from "jose";
import type { NextAuthConfig } from "next-auth"

const backendSecret = new TextEncoder().encode(
  process.env.BACKEND_JWT_SECRET!
);

const ACCESS_TOKEN_TTL_SECONDS = 10 * 60; // 10m
const ROTATE_BEFORE_EXP_SECONDS = 60;     // 1m

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    GoogleProvider({
      clientId:     process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge:   30 * 24 * 60 * 60, // 30 days
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, account, user, profile }) {
      const now = Math.floor(Date.now() / 1000);
  
      // On first sign-in, capture Google OIDC subject (stable id)
      if (account && user) {
        if (account.provider === "google") {
          const subFromIdToken =
            typeof account.id_token === "string" ? decodeJwt(account.id_token).sub : undefined;
          token.googleSub = subFromIdToken ?? (profile as any)?.sub ?? token.googleSub;
          token.name = (user as any)?.name ?? token.name;
        }
  
        // keep email if you want it on the backend token
        token.email = (user as any).email ?? token.email;
        token.backendExp = 0;
      }
  
      // rotate your backend token
      const backendExp = (token.backendExp as number) ?? 0;
      const needsNew = !token.accessToken || !backendExp || backendExp - now < 60;
  
      if (needsNew) {
        const exp = now + 10 * 60;
        token.accessToken = await new SignJWT({
          // ⬇️ the important part: use the stable Google id
          sub: String(token.googleSub || ""),
          email: token.email,
          name: token.name,
          iss: "luisterslim",  // optional: your issuer string
        })
          .setProtectedHeader({ alg: "HS256" })
          .setIssuedAt(now)
          .setExpirationTime(exp)
          .sign(backendSecret);
  
        token.backendExp = exp;
      }
  
      return token;
    },
  
    async session({ session, token }) {
      session.user = {
        ...session.user!,
        id: (token.googleSub as string) ?? (token.sub as string), // expose stable id
        googleSub: token.googleSub as string | undefined,
        name: (token as any).name ?? session.user?.name,
      };
      session.accessToken = token.accessToken as string;
      session.accessTokenExpiresAt = token.backendExp as number;
      return session;
    },
  },

  // use AUTH_SECRET to sign NextAuth JWTs
  secret:    process.env.AUTH_SECRET,
  trustHost: true,  // required for Pages/Workers
  cookies: {
    // keep sharing across subdomains
    // sessionToken: { options: { domain: ".luisterslim.nl", path: "/", secure: true, httpOnly: true,  sameSite: "lax" } },
    // ⬇️ important: httpOnly: false for CSRF
    csrfToken:    { options: {                 path: "/", secure: true, httpOnly: true,  sameSite: "lax" } },
    state:        { options: {                 path: "/", secure: true, httpOnly: true,  sameSite: "lax" } },
    // callbackUrl:  { options: { domain: ".luisterslim.nl", path: "/", secure: true, httpOnly: false, sameSite: "lax" } },
  }
} as NextAuthConfig); // type mismatch in NextAuth types
