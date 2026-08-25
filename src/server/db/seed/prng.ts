/**
 * mulberry32 — a small, fast, deterministic PRNG (SPEC-003 "Determinism":
 * "Fixed PRNG seed `mulberry32(20260824)`"). Given the same seed it produces
 * the exact same sequence of floats every time, on every machine — that is
 * the whole point: it stands in for JS's built-in pseudo-random source (forbidden in this
 * directory) everywhere the seed pipeline needs a "random" choice.
 *
 * Reference: https://gist.github.com/tommyettinger/46a874533244883189143505d203312 —
 * public-domain algorithm, reimplemented here (no dependency).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A deterministic integer in `[0, maxExclusive)`, drawn from `rng`. */
export function nextInt(rng: () => number, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

/** A deterministic integer in `[min, max]` (inclusive both ends), drawn from `rng`. */
export function nextIntRange(rng: () => number, min: number, max: number): number {
  return min + nextInt(rng, max - min + 1);
}

/** A deterministic byte in `[0, 256)`, drawn from `rng`. */
export function nextByte(rng: () => number): number {
  return nextInt(rng, 256);
}
