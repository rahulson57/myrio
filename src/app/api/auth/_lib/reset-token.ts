/**
 * Password-reset token helpers (SPEC-004 "Password reset (no email
 * provider)": "a single-use token (32 bytes, 1h TTL, `password_reset_tokens`
 * table)"). Only `/api/auth/forgot` and `/api/auth/reset` use this — kept
 * out of `src/server/auth/**` because that directory's file scope for this
 * task is a fixed list of five other files.
 *
 * The raw token is what's emailed (here: console-printed) to the user; only
 * its SHA-256 hash is ever persisted (`password_reset_tokens.token_hash`),
 * mirroring how passwords themselves are never stored in plaintext.
 */

import { randomBytes, createHash } from 'node:crypto';

/** Generates a fresh 32-byte CSPRNG token, base64url-encoded. */
export function generateResetToken(): string {
  return randomBytes(32).toString('base64url');
}

/** One-way hash of a raw reset token, for lookup/storage. Not a password —
 * SHA-256 (not argon2id) is appropriate here: the input is already 256 bits
 * of uniform random data, not a low-entropy user-chosen secret, so there's
 * nothing for a slow KDF to defend against. */
export function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
