import { afterEach, describe, expect, it } from 'vitest';
import { checkRateLimit, rateLimit, resetRateLimitStore, RATE_LIMITS, getClientIp } from '../../src/server/auth/rate-limit';
import { HttpError } from '../../src/server/auth/guard';

describe('rate-limit', () => {
  afterEach(() => {
    resetRateLimitStore();
  });

  describe('checkRateLimit', () => {
    it('allows up to `limit` requests inside the window', () => {
      const key = 'k1';
      for (let i = 0; i < 5; i++) {
        expect(checkRateLimit(key, 5, 1000).allowed).toBe(true);
      }
    });

    it('rejects the (limit + 1)th request inside the window', () => {
      const key = 'k2';
      for (let i = 0; i < 5; i++) {
        checkRateLimit(key, 5, 1000);
      }
      const result = checkRateLimit(key, 5, 1000);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('tracks separate keys independently', () => {
      for (let i = 0; i < 5; i++) checkRateLimit('a', 5, 1000);
      expect(checkRateLimit('a', 5, 1000).allowed).toBe(false);
      expect(checkRateLimit('b', 5, 1000).allowed).toBe(true);
    });

    it('resets after the window elapses', async () => {
      const key = 'k3';
      checkRateLimit(key, 1, 20);
      expect(checkRateLimit(key, 1, 20).allowed).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(checkRateLimit(key, 1, 20).allowed).toBe(true);
    });
  });

  describe('rateLimit', () => {
    it('does not throw while under the limit', () => {
      expect(() => rateLimit('rl-key', 3, 1000)).not.toThrow();
    });

    it('throws HttpError(429) once the limit is exceeded', () => {
      const key = 'rl-key-2';
      rateLimit(key, 1, 1000);
      expect(() => rateLimit(key, 1, 1000)).toThrow(HttpError);
      try {
        rateLimit(key, 1, 1000);
        expect.unreachable();
      } catch (err) {
        expect((err as HttpError).status).toBe(429);
      }
    });
  });

  it('RATE_LIMITS matches SPEC-004\'s table exactly', () => {
    expect(RATE_LIMITS.login).toEqual({ limit: 10, windowMs: 15 * 60 * 1000 });
    expect(RATE_LIMITS.signup).toEqual({ limit: 5, windowMs: 60 * 60 * 1000 });
    expect(RATE_LIMITS.forgot).toEqual({ limit: 5, windowMs: 60 * 60 * 1000 });
    expect(RATE_LIMITS.uploads).toEqual({ limit: 30, windowMs: 60 * 60 * 1000 });
  });

  describe('getClientIp', () => {
    it('reads the first entry of x-forwarded-for when present', () => {
      const req = new Request('http://localhost:4310/', {
        headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
      });
      expect(getClientIp(req)).toBe('203.0.113.5');
    });

    it('falls back to 127.0.0.1 when absent', () => {
      const req = new Request('http://localhost:4310/');
      expect(getClientIp(req)).toBe('127.0.0.1');
    });
  });
});
