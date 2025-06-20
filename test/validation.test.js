import test from 'node:test';
import assert from 'node:assert';
import { isValidUUID, sanitizeTitle } from '../src/lib/validation.js';

// Validate UUID format
test('isValidUUID returns true for valid UUID', () => {
  assert.strictEqual(isValidUUID('123e4567-e89b-12d3-a456-426614174000'), true);
});

test('isValidUUID returns false for invalid UUID', () => {
  assert.strictEqual(isValidUUID('invalid-id'), false);
});

// Sanitize title
test('sanitizeTitle trims and limits length', () => {
  assert.strictEqual(sanitizeTitle('  hello world  ', 5), 'hello');
});
