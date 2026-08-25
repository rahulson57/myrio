import { describe, expect, it } from 'vitest';
import { mulberry32, nextByte, nextInt, nextIntRange } from '../prng';

describe('mulberry32', () => {
  it('is deterministic: the same seed produces the same sequence', () => {
    const a = mulberry32(20260824);
    const b = mulberry32(20260824);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds produce different sequences', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it('produces floats in [0, 1)', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 1000; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('nextInt / nextIntRange / nextByte', () => {
  it('nextInt stays within [0, max)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i += 1) {
      const v = nextInt(rng, 10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('nextIntRange stays within [min, max] inclusive', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i += 1) {
      const v = nextIntRange(rng, 5, 8);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(8);
    }
  });

  it('nextByte stays within [0, 256)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i += 1) {
      const v = nextByte(rng);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(256);
    }
  });
});
