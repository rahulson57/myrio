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

export function deleteSession(db: MyrioDatabase, id: string): void {
  db.delete(sessions).where(eq(sessions.id, id)).run();
}
