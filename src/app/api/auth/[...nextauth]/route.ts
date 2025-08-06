// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

// (Edge is the default runtime, so you can omit this if you like)
export const runtime = 'edge'

// create the handler
const handler = NextAuth(authOptions)

// **only** these exports are allowed:
export { handler as GET, handler as POST }
