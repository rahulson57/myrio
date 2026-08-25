/**
 * Shared request-body validation for the `/api/auth/**` Route Handlers
 * (SPEC-004 "Password hashing" policy + the field shapes `users` requires).
 * Lives under `src/app/api/auth/` (in this task's file scope as a whole
 * directory) rather than `src/server/auth/**`, whose file scope is a fixed
 * list of five named files this module doesn't extend.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

/** SPEC-004 "Password policy": ">= 10 characters, no composition rules". */
export const MIN_PASSWORD_LENGTH = 10;

const COMMON_PASSWORDS_PATH = path.join(
  process.cwd(),
  'src/server/auth/common-passwords.txt',
);

let commonPasswords: Set<string> | undefined;

/** Lazily loads and caches the bundled 10k-common-password list (SPEC-004:
 * "a local file, no API"). One read for the life of the process. */
function getCommonPasswords(): Set<string> {
  if (!commonPasswords) {
    const raw = readFileSync(COMMON_PASSWORDS_PATH, 'utf-8');
    commonPasswords = new Set(
      raw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    );
  }
  return commonPasswords;
}

/** Returns a user-facing error message if `password` violates SPEC-004's
 * policy, or `null` if it's acceptable. Exact-string match against the
 * common-password list (case-sensitive) — the list is the literal 10k
 * corpus SPEC-004 names, and "appears in common-passwords.txt" is read
 * literally rather than folding case. */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (getCommonPasswords().has(password)) {
    return 'This password is too common. Please choose a different one.';
  }
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Minimal shape check — real deliverability is out of scope for a
 * localhost-only app with no email provider (SPEC-004). */
export function validateEmail(email: string): string | null {
  if (!EMAIL_RE.test(email)) {
    return 'Enter a valid email address.';
  }
  return null;
}

// `users.handle` (SPEC-002) is a unique text column used directly in URLs
// (`/@handle`, per SPEC-009/architecture.md's `navigationIntent`). No spec
// in this task's scope defines a handle format, so this is a narrow,
// judgment-call policy for the signup form only — documented here rather
// than guessed silently: lowercase, 3-30 chars, starts with a letter or
// digit, and may contain letters/digits/underscore/hyphen after that.
const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/;

export function validateHandle(handle: string): string | null {
  if (!HANDLE_RE.test(handle)) {
    return 'Handle must be 3-30 characters: lowercase letters, numbers, "_" or "-", starting with a letter or number.';
  }
  return null;
}

export function validateDisplayName(displayName: string): string | null {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) {
    return 'Display name is required.';
  }
  if (trimmed.length > 100) {
    return 'Display name must be 100 characters or fewer.';
  }
  return null;
}

export interface FieldErrors {
  [field: string]: string;
}

/** Uniform 400 shape for every validation failure across the auth routes:
 * `{ error: 'Validation failed', fields: { <field>: <message> } }`. */
export function validationErrorResponse(fields: FieldErrors): Response {
  return Response.json({ error: 'Validation failed', fields }, { status: 400 });
}
