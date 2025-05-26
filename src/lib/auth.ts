// utils/auth.ts

import { signIn, signOut } from 'next-auth/react';

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
