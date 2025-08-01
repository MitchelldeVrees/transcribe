// anywhere in your code, e.g. src/lib/referral.ts

import crypto from 'crypto'

/**
 * Generate a 20‑character referral code:
 *  - first 8 chars = hex SHA256 of email
 *  - next 12 chars = random alphanumeric
 */
export function generateReferralCode(email: string): string {
  // 1) deterministic part from email
  const emailHash = crypto.createHash('sha256').update(email).digest('hex')
  const prefix = emailHash.slice(0, 8)  // 8 hex chars

  // 2) random alphanumeric
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let suffix = ''
  for (let i = 0; i < 12; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length))
  }

  return (prefix + suffix).slice(0, 20)
}
