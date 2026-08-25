/**
 * Password hashing (SPEC-004 "Password hashing"). The only place a
 * password is hashed or verified anywhere in the codebase.
 *
 * | Param       | Value                                    |
 * |-------------|-------------------------------------------|
 * | Algorithm   | argon2id (`@node-rs/argon2`, prebuilt native) |
 * | memoryCost  | 19456 KiB (19 MiB)                        |
 * | timeCost    | 2                                          |
 * | parallelism | 1                                          |
 *
 * `hashPassword` is the real runtime path: `@node-rs/argon2` generates a
 * fresh CSPRNG salt per call (never supplied by this module), so hashing
 * the same password twice yields two different encoded strings. This is
 * what `POST /api/auth/signup` and password changes must use.
 *
 * `hashPasswordWithSalt` exists ONLY for callers that need the SAME
 * encoded hash across separate runs given identical inputs — Seed Data
 * seeds 12 users and its determinism criterion requires two clean seed
 * runs to be byte-identical row-for-row, which is impossible with a random
 * salt. It runs the identical algorithm and parameters; only the salt
 * source differs, and that source is the caller's responsibility (Seed
 * Data derives it from its own deterministic PRNG, never from this
 * module). Nothing in the runtime signup/login path may call it.
 */

import { hash, verify, type Algorithm } from '@node-rs/argon2';

// `Algorithm` is an ambient `const enum` (isolatedModules forbids reading
// its members as a value — TS2748), so the id is a literal: 2 is
// `Algorithm.Argon2id` per @node-rs/argon2's index.d.ts.
const ARGON2ID: Algorithm = 2;

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  algorithm: ARGON2ID,
} as const;

/** Hashes `password` with a fresh random salt. Use for real signups and
 * password changes — never for anything that needs to reproduce the same
 * hash on a later call. */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** Hashes `password` with the caller-supplied `salt`, so the same
 * `(password, salt)` pair always produces the same encoded hash. Exists
 * for deterministic seeding only — see module doc comment. */
export async function hashPasswordWithSalt(password: string, salt: Uint8Array): Promise<string> {
  return hash(password, { ...ARGON2_OPTIONS, salt });
}

/** Verifies `password` against a previously encoded argon2id hash.
 * Constant-time via the underlying library. Never throws — a malformed or
 * foreign-format `encodedHash` is treated as a verification failure, not
 * an error, so callers on the login path can treat "wrong password" and
 * "unreadable hash" identically. */
export async function verifyPassword(encodedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(encodedHash, password);
  } catch {
    return false;
  }
}
