import bcrypt from 'bcryptjs';

const DEFAULT_ROUNDS = 12;

function resolveSaltRounds() {
  const raw = process.env.AUTH_PASSWORD_SALT_ROUNDS;
  const parsed = raw ? Number(raw) : DEFAULT_ROUNDS;
  return Number.isFinite(parsed) && parsed >= 4 ? parsed : DEFAULT_ROUNDS;
}

const saltRounds = resolveSaltRounds();

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) {
    return 'Wachtwoord moet minstens 8 tekens bevatten.';
  }
  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigit = /\d/.test(password);
  if (!hasLetter || !hasDigit) {
    return 'Gebruik minimaal een letter en een cijfer in je wachtwoord.';
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}
