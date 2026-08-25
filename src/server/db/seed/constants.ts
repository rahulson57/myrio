/**
 * Seed Data constants (SPEC-003 "Determinism"). Every deterministic value in
 * `src/server/db/seed/**` derives from these two constants — never from
 * the wall clock or JS's built-in pseudo-random source (enforced by a repo-wide
 * grep over this directory, see SPEC-003 acceptance criteria).
 */

/** Fixed PRNG seed. `mulberry32(PRNG_SEED)` (see `./prng.ts`) is the only
 * source of "randomness" anywhere in the seed pipeline. */
export const PRNG_SEED = 20260824;

/**
 * Fixed "now" for the seed corpus: 2026-08-24T00:00:00.000Z, computed once
 * (`Date.parse('2026-08-24T00:00:00.000Z')`) and inlined as a literal so no
 * `Date` call appears anywhere in this module. Every timestamp the seed
 * pipeline writes is this constant plus a fixed, deterministic offset.
 */
export const SEED_EPOCH_MS = 1787529600000;

/** Dev-fixture password for every seeded user (SPEC-003 volumes table).
 * NOTE: this is not a real password hash — see `users.ts` doc comment for
 * why, and the caveat about Auth & Session (a later, not-yet-built slice)
 * owning the real hashing scheme. */
export const SEED_DEV_PASSWORD = 'myrio-dev-2026';
