// src/lib/validation.js
// Basic validation utilities used across API routes.
// Implemented in JavaScript so tests can run without a TS runtime.

// Validate that a string is a valid v4 UUID.
export function isValidUUID(id) {
  if (typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id.trim());
}

// Sanitize a string by trimming and limiting length.
export function sanitizeTitle(title, maxLen = 100) {
  if (typeof title !== 'string') return '';
  return title.trim().slice(0, maxLen);
}
