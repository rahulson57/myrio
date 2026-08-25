import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { MyrioDatabase } from '../client';
import { sessions } from '../schema';

export type Session = typeof sessions.$inferSelect;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Generates the session id. Per SPEC-002 this is deliberately NOT a UUIDv7
 * (unlike every other primary key) — it doubles as the session cookie value,
 * so it must be unguessable rather than time-sortable: 256 bits of CSPRNG
 * output, base64url-encoded.
 */
export function generateSessionId(): string {
  return randomBytes(32).toString('base64url');
}

/** Creates a session for `userId`, expiring 30 days from now. */
export function createSession(db: MyrioDatabase, userId: string): Session {
  const now = Date.now();
  return db
    .insert(sessions)
    .values({
      id: generateSessionId(),
      userId,
      expiresAt: now + THIRTY_DAYS_MS,
      createdAt: now,
      lastSeenAt: now,
    })
    .returning()
    .get();
}

export function getSessionById(db: MyrioDatabase, id: string): Session | undefined {
  return db.select().from(sessions).where(eq(sessions.id, id)).get();
}

/** Bumps `last_seen_at` to now. */
export function touchSession(db: MyrioDatabase, id: string): Session | undefined {
  return db
    .update(sessions)
    .set({ lastSeenAt: Date.now() })
    .where(eq(sessions.id, id))
    .returning()
    .get();
}

/**
 * Sliding renewal (SPEC-004 "Session lifecycle": "sliding renewal when the
 * session is > 24h old and used"): bumps `last_seen_at` to now AND pushes
 * `expires_at` back out to 30 days from now, so an actively-used session
 * never expires. Added for the Auth & Session module (TASK-020) per DEC-034
 * — this repository's own `createSession`/`touchSession` had no expires_at
 * write path, which made the spec's sliding-renewal behavior unimplementable
 * from outside this module. Auth calls this only when the session is more
 * than 24h stale; `touchSession` (unchanged) covers every other request. */
export function renewSession(db: MyrioDatabase, id: string): Session | undefined {
  const now = Date.now();
  return db
    .update(sessions)
    .set({ lastSeenAt: now, expiresAt: now + THIRTY_DAYS_MS })
    .where(eq(sessions.id, id))
    .returning()
    .get();
}

export function deleteSession(db: MyrioDatabase, id: string): void {
  db.delete(sessions).where(eq(sessions.id, id)).run();
}

/**
 * Deletes every session row for `userId` (SPEC-004: "log out everywhere"
 * and password-change invalidation — "Changing a password deletes every
 * other session row for that user"). Added for the Auth & Session module
 * (TASK-020) alongside `renewSession` above (DEC-034): `session.ts`
 * (src/server/auth/session.ts) already imports this name — it was written
 * assuming this function existed, but the prior worker's session died
 * before adding it here. Same narrow-additive justification as
 * `renewSession`: this repository is the only writer to `sessions`
 * (SPEC-002), and there was no other way to satisfy SPEC-004's
 * invalidate-all-sessions requirement. */
export function deleteSessionsByUserId(db: MyrioDatabase, userId: string): void {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}
