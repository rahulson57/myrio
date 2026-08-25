/**
 * Session lifecycle + cookie handling (SPEC-004 "Session lifecycle"). This
 * module is the only place the `myrio_session` cookie is read, written or
 * cleared, and the only place a raw session cookie value is turned into a
 * validated `{userId, sessionId}` pair. `src/server/auth/guard.ts` is the
 * thin per-request wrapper around it; route handlers go through guard.ts,
 * not this module, for auth checks.
 *
 * All actual SQLite access goes through `src/server/db/repositories/
 * sessions.ts` (Data Layer, SPEC-002) — this module never opens its own
 * connection or touches the `sessions` table directly.
 */

import type { MyrioDatabase } from '../db/client';
import {
  createSession,
  deleteSession,
  deleteSessionsByUserId,
  generateSessionId,
  getSessionById,
  renewSession,
  touchSession,
  type Session as SessionRow,
} from '../db/repositories/sessions';

export const SESSION_COOKIE_NAME = 'myrio_session';

/** 30 days, in seconds — used for the cookie's Max-Age attribute. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * SPEC-004 states the session's lifetime two ways in the same section —
 * "30 days absolute" in the lifecycle table, and "sliding renewal when the
 * session is > 24h old and used" in both that table and the state diagram.
 * Read literally, those contradict: a renewal that pushes `expires_at`
 * forward is not an absolute 30-day cap from creation, and an absolute cap
 * makes "sliding renewal" a no-op. This module implements the sliding
 * reading — `resolveSession` pushes `expires_at` back out to `now + 30d`
 * once the session has gone quiet for more than a day — because it's the
 * only one of the two where the stated behavior does anything; a literal
 * absolute cap would make half of SPEC-004's own sentence dead text. Flagged
 * here (and in the proposal) rather than resolved silently, per DEC-034.
 */
const RENEWAL_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export interface ResolvedSession {
  userId: string;
  sessionId: string;
}

/**
 * Extracts this app's session cookie value from a raw `Cookie` request
 * header. Parsed by hand (not via `NextRequest.cookies`) because the guard
 * module's contract (SPEC-004) types its request parameter as the plain Web
 * `Request`, not a Next.js-specific type.
 */
export function getSessionIdFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const name = part.slice(0, eqIndex).trim();
    if (name === SESSION_COOKIE_NAME) {
      const value = part.slice(eqIndex + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }

  return null;
}

/** Builds the `Set-Cookie` header value for a freshly-created session. Every
 * attribute SPEC-004 requires: HttpOnly, SameSite=Lax, Path=/, Max-Age=30d.
 * `Secure` is deliberately omitted — this app is served over plain HTTP on
 * localhost (SPEC-001), and `Secure` would make the browser refuse to store
 * the cookie at all. */
export function serializeSessionCookie(sessionId: string): string {
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ].join('; ');
}

/** Builds the `Set-Cookie` header value that clears the session cookie
 * (logout: `Max-Age=0` with an empty value). */
export function serializeExpiredSessionCookie(): string {
  return [`${SESSION_COOKIE_NAME}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'].join('; ');
}

/** Creates a new session row for `userId`. */
export function createSessionForUser(db: MyrioDatabase, userId: string): SessionRow {
  return createSession(db, userId);
}

/** Deletes one session row (logout). */
export function destroySession(db: MyrioDatabase, sessionId: string): void {
  deleteSession(db, sessionId);
}

/** Deletes every session row for a user (password change/reset invalidation,
 * and "log out everywhere"). */
export function destroyAllSessionsForUser(db: MyrioDatabase, userId: string): void {
  deleteSessionsByUserId(db, userId);
}

/**
 * Resolves a raw session-cookie value against the `sessions` table.
 *
 * - Unknown id: returns null.
 * - Expired (`expires_at` in the past): the row is swept (deleted) and this
 *   returns null (SPEC-004: "Sweep: Expired rows deleted lazily on lookup").
 * - Valid but unused for > 24h: sliding renewal — `last_seen_at` and
 *   `expires_at` are both reset (see `RENEWAL_THRESHOLD_MS` doc comment).
 * - Valid and recently used: `last_seen_at` is bumped; `expires_at` is left
 *   alone.
 */
export function resolveSession(db: MyrioDatabase, sessionId: string): ResolvedSession | null {
  const row = getSessionById(db, sessionId);
  if (!row) return null;

  const now = Date.now();
  if (row.expiresAt <= now) {
    deleteSession(db, row.id);
    return null;
  }

  if (now - row.lastSeenAt > RENEWAL_THRESHOLD_MS) {
    renewSession(db, row.id);
  } else {
    touchSession(db, row.id);
  }

  return { userId: row.userId, sessionId: row.id };
}

export { generateSessionId };
