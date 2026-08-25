import { nextByte } from './prng';

/**
 * A deterministic stand-in for `generateUuidV7` (`src/server/db/schema.ts`),
 * which is unusable here because it calls the wall clock and
 * `node:crypto.randomBytes` directly (SPEC-003 "Determinism": "Ids are
 * UUIDv7 derived from the PRNG + `SEED_EPOCH_MS`, preserving
 * time-sortability").
 *
 * Produces the same RFC 9562 UUIDv7 byte layout (48-bit big-endian ms
 * timestamp, version 7, `rand_a`/`rand_b` random fields, variant 10) but
 * sources the timestamp from `baseMs + <call count>` and the "random" bytes
 * from `rng` (a `mulberry32` instance), so the exact same `(rng, baseMs)`
 * pair always yields the exact same sequence of ids, in the exact same
 * order, still time-sortable (each id's embedded timestamp is >= the
 * previous one).
 */
export function createIdFactory(rng: () => number, baseMs: number): () => string {
  let calls = 0;

  return function nextId(): string {
    const ts = BigInt(baseMs + calls);
    calls += 1;

    const randBytes = new Uint8Array(10);
    for (let i = 0; i < randBytes.length; i += 1) {
      randBytes[i] = nextByte(rng);
    }

    const bytes = new Uint8Array(16);
    bytes[0] = Number((ts >> 40n) & 0xffn);
    bytes[1] = Number((ts >> 32n) & 0xffn);
    bytes[2] = Number((ts >> 24n) & 0xffn);
    bytes[3] = Number((ts >> 16n) & 0xffn);
    bytes[4] = Number((ts >> 8n) & 0xffn);
    bytes[5] = Number(ts & 0xffn);
    // version 7 in the high nibble of byte 6; top 4 bits of rand_a in the low nibble
    bytes[6] = 0x70 | (randBytes[0]! & 0x0f);
    bytes[7] = randBytes[1]!;
    // variant 10 in the top 2 bits of byte 8
    bytes[8] = 0x80 | (randBytes[2]! & 0x3f);
    bytes[9] = randBytes[3]!;
    bytes[10] = randBytes[4]!;
    bytes[11] = randBytes[5]!;
    bytes[12] = randBytes[6]!;
    bytes[13] = randBytes[7]!;
    bytes[14] = randBytes[8]!;
    bytes[15] = randBytes[9]!;

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
}

/**
 * A deterministic monotonic clock: each call advances by `stepMs` and
 * returns the new value, starting from `startMs`. Stands in for
 * the wall clock everywhere the seed pipeline needs "the current time" for a
 * `created_at`/`updated_at`/`published_at` stamp.
 */
export function createClock(startMs: number, stepMs: number): () => number {
  let current = startMs - stepMs;
  return function tick(): number {
    current += stepMs;
    return current;
  };
}
