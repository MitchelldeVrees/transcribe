// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth'
import { authOptions } from '@/lib/nextAuth'

// NextAuth relies on Node.js APIs, so use the Node.js runtime.
export const runtime = 'nodejs'

// create the handler
const handler = NextAuth(authOptions)

// **only** these exports are allowed:
export { handler as GET, handler as POST }
