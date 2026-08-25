/**
 * In-process fixed-window rate limiter (SPEC-004 "Rate limiting"). A single
 * process has no coordination problem to solve, so this is deliberately not
 * backed by Redis or any external store — just a `Map` keyed by caller.
 *
 * Every mutating auth endpoint (and, per SPEC-004's table, `POST
 * /api/uploads` in a later slice) calls `checkRateLimit` with its own key
 * and one of the named `RATE_LIMITS` below. Keys are caller-composed
 * (`${email}:${ip}` for login, `${ip}` for signup, `${email}` for forgot) so
 * this module stays agnostic about what a "caller" is.
 */

import { HttpError } from './guard';

interface WindowState {
  count: number;
  windowStart: number;
}

/** One shared store for the process. Not exported — callers only ever touch
 * it through `checkRateLimit`/`resetRateLimitStore`. */
const store = new Map<string, WindowState>();

export interface RateLimitResult {
  /** Whether this call is allowed under the window. */
  allowed: boolean;
  /** Present only when `allowed` is false: milliseconds until the window
   * resets and the caller may retry. */
  retryAfterMs?: number;
}

/**
 * Fixed-window check-and-increment for `key`. The window resets `windowMs`
 * after its first request; up to `limit` requests are allowed inside it.
 *
 * Fixed-window (not sliding-log/token-bucket) per SPEC-004's own description
 * of the mechanism ("`Map<string, {count, windowStart}>`") — simplest thing
 * that satisfies the acceptance criteria (Nth request in a window is
 * rejected), at the cost of allowing up to `2 * limit` requests across a
 * window boundary. Acceptable for a single-machine dev app with no hostile
 * network attacker in its threat model (SPEC-004).
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const state = store.get(key);

  if (!state || now - state.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (state.count < limit) {
    state.count += 1;
    return { allowed: true };
  }

  return { allowed: false, retryAfterMs: windowMs - (now - state.windowStart) };
}

/** Clears every tracked window. Test-only: lets each rate-limit test start
 * from a clean store instead of colliding on shared keys/global state. */
export function resetRateLimitStore(): void {
  store.clear();
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** Named limits exactly as SPEC-004's "Rate limiting" table specifies them. */
export const RATE_LIMITS = {
  /** 10 / 15 min per email+IP. */
  login: { limit: 10, windowMs: 15 * MINUTE_MS },
  /** 5 / hour per IP. */
  signup: { limit: 5, windowMs: HOUR_MS },
  /** 5 / hour per email. */
  forgot: { limit: 5, windowMs: HOUR_MS },
  /** 30 / hour per user. Consumed by the Media & Uploads slice, not this
   * module — defined here so every rate limit stays in one named table. */
  uploads: { limit: 30, windowMs: HOUR_MS },
} as const;

/**
 * Throwing wrapper around `checkRateLimit`, named exactly as
 * `docs/specs/architecture.md` (LOCKED) lists it in this module's interface:
 * `rateLimit(key, limit, windowMs): void — throws HttpError(429)`. Route
 * handlers that want a throw-on-exceeded call site (matching the
 * `requireUser`/`requireOwner`/`requireSameOrigin` style in guard.ts) use
 * this; `checkRateLimit` itself stays available for callers that want the
 * `{allowed, retryAfterMs}` result directly.
 */
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const result = checkRateLimit(key, limit, windowMs);
  if (!result.allowed) {
    throw new HttpError(429, 'Too Many Requests');
  }
}

/**
 * Best-effort client IP for a request on this single-machine app. There is
 * no trusted reverse proxy in front of Next.js here (SPEC-001: localhost
 * only, no CDN), so `x-forwarded-for` is only ever set by the caller itself
 * — this is a rate-limit key, not a security boundary, hence "best-effort".
 */
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const [first] = forwardedFor.split(',');
    if (first?.trim()) {
      return first.trim();
    }
  }
  return '127.0.0.1';
}
