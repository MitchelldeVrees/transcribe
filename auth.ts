// auth.ts  (project root, not in src/)
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { SignJWT } from "jose";
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
    async jwt({ token, account, user }) {
      const now = Math.floor(Date.now() / 1000);

      // On first sign-in, stash userId/email and reset backendExp
      if (account && user) {
        token.userId     = token.sub ?? (user as any).id;
        token.email      = (user as any).email ?? token.email;
        token.backendExp = 0;
      }

      const backendExp = (token.backendExp as number) ?? 0;
      const needsNew   =
        !token.accessToken ||
        !backendExp ||
        backendExp - now < ROTATE_BEFORE_EXP_SECONDS;

      if (needsNew) {
        const exp = now + ACCESS_TOKEN_TTL_SECONDS;
        console.log(
          `[JWT ROTATE] issuing new backend token, exp=${new Date(
            exp * 1000
          ).toISOString()}`
        );

        token.accessToken = await new SignJWT({
          sub:   String(token.userId ?? token.sub ?? ""),
          email: token.email,
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
        id: (token.userId as string) ?? (token.sub as string),
      };
      session.accessToken          = token.accessToken as string;
      session.accessTokenExpiresAt = token.backendExp as number;
      return session;
    },
  },

  // use AUTH_SECRET to sign NextAuth JWTs
  secret:    process.env.AUTH_SECRET,
  trustHost: true,  // required for Pages/Workers
} as NextAuthConfig); // type mismatch in NextAuth types
