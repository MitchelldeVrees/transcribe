// types/next-auth.d.ts  (or src/types/next-auth.d.ts)
import { DefaultSession } from "next-auth";

// next-auth.d.ts
declare module "next-auth/jwt" {
  interface JWT {
    googleSub?: string;
    backendExp?: number;
    accessToken?: string;
    email?: string;
    name?: string;
  }
}
declare module "next-auth" {
  interface Session {
    accessToken?: string;
    accessTokenExpiresAt?: number;
    user: DefaultSession["user"] & { id: string; googleSub?: string };
  }
}


// Ensure this file is treated as a module (helps with isolatedModules)
export {};
