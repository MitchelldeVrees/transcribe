// utils/auth.ts

import { signIn, signOut } from 'next-auth/react';

import { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
/**
 * Triggers the NextAuth Google sign-in flow.
 * @returns A promise that resolves when the sign-in popup/redirect is initiated.
 */
export const handleSignIn = async (): Promise<void> => {
  await signIn('google');
};

/**
 * Triggers the NextAuth sign-out flow.
 * @returns A promise that resolves when the sign-out process is initiated.
 */
export const handleSignOut = async (): Promise<void> => {
  await signOut();
};

// src/lib/auth.ts


export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET!,
  // any other callbacks / pages / session settings…
};
