// src/lib/nextauth.ts
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { SignJWT } from "jose";

const secret = new TextEncoder().encode(process.env.BACKEND_JWT_SECRET!);

// JWT issued for backend requests is short‑lived (10 minutes) and refreshed
// via NextAuth's session handling so users remain logged in without reauth.
const ACCESS_TOKEN_TTL_SECONDS = 10 * 60; // 10 minutes
// Refresh the token a minute before it expires to avoid race conditions.
const ROTATE_BEFORE_EXP_SECONDS = 60;

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt",
    // Keep the session for 30 days even though the backend token rotates.
    maxAge: 30 * 24 * 60 * 60,
  },
  jwt: {
    // Mirror session maxAge so the session provider can refresh the token.
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, account, user }) {
      const now = Math.floor(Date.now() / 1000);

      // On first sign-in initialize fields
      if (account && user) {
        token.userId = token.sub ?? (user as any).id ?? undefined;
        token.email = (user as any).email ?? token.email;
        token.backendExp = 0;
      }

      const backendExp = (token.backendExp as number | undefined) ?? 0;
      const needsNew =
        !token.accessToken ||
        !backendExp ||
        backendExp - now < ROTATE_BEFORE_EXP_SECONDS;

      if (needsNew) {
        const exp = now + ACCESS_TOKEN_TTL_SECONDS;

        // helpful during testing
        console.log(
          `[JWT ROTATE] issuing new backend token exp=${new Date(exp * 1000).toISOString()}`
        );

        token.accessToken = await new SignJWT({
          sub: String(token.userId ?? token.sub ?? ""),
          email: token.email,
          // Optional hardening if you enforce them in requireAuth:
          // aud: "my-backend",
          // iss: "my-frontend",
          // ver: 1,
        })
          .setProtectedHeader({ alg: "HS256" })
          .setIssuedAt(now)
          .setExpirationTime(exp) // numeric seconds OK
          .sign(secret);

        token.backendExp = exp;
      }

      return token;
    },

    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: (token.userId as string) ?? (token.sub as string),
      };
      session.accessToken = token.accessToken as string;
      session.accessTokenExpiresAt = token.backendExp as number;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
