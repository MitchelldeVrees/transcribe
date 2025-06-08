// app/api/auth/[...nextauth]/route.ts

import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// NextAuth handler
const handler = NextAuth(authOptions);

// Export it under the two HTTP verbs NextAuth uses:
export { handler as GET, handler as POST };
