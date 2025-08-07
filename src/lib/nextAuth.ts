import NextAuth from "next-auth"
import type { NextAuthConfig } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { SignJWT } from "jose"

const secret = new TextEncoder().encode(process.env.BACKEND_JWT_SECRET!)

const authConfig: NextAuthConfig = {
  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  jwt: { maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    async jwt({ token, account, user }) {
      const now = Math.floor(Date.now() / 1000)
      if (account && user) {
        token.userId = token.sub ?? (user as any).id
        token.email = (user as any).email ?? token.email
        token.backendExp = 0
      }
      const ttl = 10 * 60
      const rotateBefore = 60
      const backendExp = (token.backendExp as number) ?? 0
      if (!token.accessToken || !backendExp || backendExp - now < rotateBefore) {
        const exp = now + ttl
        token.accessToken = await new SignJWT({
          sub: String(token.userId ?? token.sub ?? ""),
          email: token.email,
        })
          .setProtectedHeader({ alg: "HS256" })
          .setIssuedAt(now)
          .setExpirationTime(exp)
          .sign(secret)
        token.backendExp = exp
      }
      return token
    },
    async session({ session, token }) {
      session.user = { ...session.user, id: (token.userId as string) ?? (token.sub as string) }
      session.accessToken = token.accessToken as string
      session.accessTokenExpiresAt = token.backendExp as number
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
