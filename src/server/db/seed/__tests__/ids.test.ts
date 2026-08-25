import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../prng';
import { createClock, createIdFactory } from '../ids';

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('createIdFactory', () => {
  it('produces RFC 9562-shaped UUIDv7 strings (version 7, variant 10)', () => {
    const nextId = createIdFactory(mulberry32(1), 1_700_000_000_000);
    for (let i = 0; i < 10; i += 1) {
      expect(nextId()).toMatch(UUID_V7_RE);
    }
  });

  it('is deterministic: same (seed, baseMs) produces the same id sequence', () => {
    const a = createIdFactory(mulberry32(20260824), 1_700_000_000_000);
    const b = createIdFactory(mulberry32(20260824), 1_700_000_000_000);
    const seqA = Array.from({ length: 15 }, () => a());
    const seqB = Array.from({ length: 15 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('every id in a sequence is unique', () => {
    const nextId = createIdFactory(mulberry32(3), 1_700_000_000_000);
    const ids = Array.from({ length: 200 }, () => nextId());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ids are time-sortable: lexical string order matches call order', () => {
    const nextId = createIdFactory(mulberry32(9), 1_700_000_000_000);
    const ids = Array.from({ length: 50 }, () => nextId());
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });
});

describe('createClock', () => {
  it('advances by stepMs on each call, starting at startMs', () => {
    const tick = createClock(1000, 100);
    expect(tick()).toBe(1000);
    expect(tick()).toBe(1100);
    expect(tick()).toBe(1200);
  });

  it('is deterministic across independent instances', () => {
    const a = createClock(500, 25);
    const b = createClock(500, 25);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });
});
