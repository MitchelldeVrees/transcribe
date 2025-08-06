// src/lib/nextauth.ts
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { SignJWT } from "jose";

const secret = new TextEncoder().encode(process.env.BACKEND_JWT_SECRET!);

/** ---- TEST SETTINGS ----
 * For testing:
 *   ACCESS_TOKEN_TTL_SECONDS = 20
 *   maxAge (session/jwt)     = 40
 * For production, consider:
 *   ACCESS_TOKEN_TTL_SECONDS = 15 * 60 (15m)
 *   maxAge                   = 30 * 24 * 60 * 60 (30d)
 */
const ACCESS_TOKEN_TTL_SECONDS = 20;  // <- change to 15*60 after testing
const ROTATE_BEFORE_EXP_SECONDS = 5;

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 40, // <- change to 30 days in prod
  },
  jwt: {
    maxAge: 40, // <- keep in sync with session for test
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
