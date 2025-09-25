// src/lib/referral.ts
// Edge/Workers-safe referral code generator.
// No Node 'crypto' import; uses Web Crypto available on Cloudflare Workers / Next.js edge runtime.

// Generate a 20-character, uppercase, unambiguous code (Base32 alphabet A-Z2-7).
// We sample 12 random bytes (96 bits) -> 20 Base32 chars.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function requireWebCrypto(): Crypto {
  // In Node 20+ globalThis.crypto exists; on Workers it always exists.
  const c = (globalThis as any).crypto as Crypto | undefined;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error(
      'Web Crypto API not available. Run on Node 18+/20+ or an Edge/Workers runtime.'
    );
  }
  return c;
}

function base32EncodeNoPad(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;

    while (bits >= 5) {
      const idx = (value >>> (bits - 5)) & 31;
      bits -= 5;
      output += ALPHABET[idx];
    }
  }

  if (bits > 0) {
    // pad remaining bits with zeros
    const idx = (value << (5 - bits)) & 31;
    output += ALPHABET[idx];
  }

  return output;
}

/**
 * Generate a 20-character referral code.
 * - Uppercase A-Z and digits 2-7 (no 0/1 to avoid confusion).
 * - Cryptographically strong randomness via Web Crypto.
 * - Synchronous API to match existing call sites.
 *
 * `email` parameter kept for signature compatibility (not used in randomness).
 */
export function generateReferralCode(_email?: string): string {
  const crypto = requireWebCrypto();

  // 12 random bytes -> 20 Base32 chars
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);

  const code = base32EncodeNoPad(buf);

  // Ensure exactly 20 chars (it will be with 12 bytes, but slice defensively)
  return code.slice(0, 20);
}
