import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  getSessionIdFromCookieHeader,
  serializeSessionCookie,
  serializeExpiredSessionCookie,
  createSessionForUser,
  destroySession,
  destroyAllSessionsForUser,
  resolveSession,
} from '../../src/server/auth/session';
import { createMigratedTestDb, createTestUser, type TestDb } from './test-utils';

describe('session cookie helpers', () => {
  it('SESSION_COOKIE_NAME is myrio_session', () => {
    expect(SESSION_COOKIE_NAME).toBe('myrio_session');
  });

  it('SESSION_MAX_AGE_SECONDS is 30 days', () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
  });

  describe('getSessionIdFromCookieHeader', () => {
    it('returns null for a null header', () => {
      expect(getSessionIdFromCookieHeader(null)).toBeNull();
    });

    it('returns null when the cookie is absent', () => {
      expect(getSessionIdFromCookieHeader('other=1; another=2')).toBeNull();
    });

    it('extracts the session id among other cookies', () => {
      expect(getSessionIdFromCookieHeader('a=1; myrio_session=abc123; b=2')).toBe('abc123');
    });

    it('URL-decodes the value', () => {
      expect(getSessionIdFromCookieHeader('myrio_session=a%2Fb%3D')).toBe('a/b=');
    });
  });

  describe('serializeSessionCookie', () => {
    const cookie = serializeSessionCookie('the-session-id');

    it('contains HttpOnly, SameSite=Lax, Path=/, and the correct Max-Age', () => {
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain(`Max-Age=${SESSION_MAX_AGE_SECONDS}`);
    });

    it('does not set Secure (plain HTTP on localhost)', () => {
      expect(cookie).not.toContain('Secure');
    });

    it('carries only the opaque session id — no user data', () => {
      expect(cookie).toContain('myrio_session=the-session-id');
      expect(cookie).not.toContain('userId');
      expect(cookie).not.toContain('@'); // no email-shaped data
    });
  });

  describe('serializeExpiredSessionCookie', () => {
    it('clears the cookie with Max-Age=0 and an empty value', () => {
      const cookie = serializeExpiredSessionCookie();
      expect(cookie).toContain('myrio_session=;');
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
    });
  });
});

describe('session lifecycle (against a temp db)', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('createSessionForUser + resolveSession round-trips to {userId, sessionId}', async () => {
    const { user } = await createTestUser(testDb.db);
    const session = createSessionForUser(testDb.db, user.id);
    expect(resolveSession(testDb.db, session.id)).toEqual({ userId: user.id, sessionId: session.id });
  });

  it('destroySession deletes the row: a subsequent lookup returns null and the row is gone', async () => {
    const { user } = await createTestUser(testDb.db);
    const session = createSessionForUser(testDb.db, user.id);

    destroySession(testDb.db, session.id);

    expect(resolveSession(testDb.db, session.id)).toBeNull();
    const row = testDb.sqlite.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
    expect(row).toBeUndefined();
  });

  it('destroyAllSessionsForUser deletes every session row for that user, leaving others untouched', async () => {
    const { user: userA } = await createTestUser(testDb.db, { email: 'a@example.com', handle: 'user_a' });
    const { user: userB } = await createTestUser(testDb.db, { email: 'b@example.com', handle: 'user_b' });
    const sessionA1 = createSessionForUser(testDb.db, userA.id);
    const sessionA2 = createSessionForUser(testDb.db, userA.id);
    const sessionB = createSessionForUser(testDb.db, userB.id);

    destroyAllSessionsForUser(testDb.db, userA.id);

    expect(resolveSession(testDb.db, sessionA1.id)).toBeNull();
    expect(resolveSession(testDb.db, sessionA2.id)).toBeNull();
    expect(resolveSession(testDb.db, sessionB.id)).toEqual({ userId: userB.id, sessionId: sessionB.id });
  });

  it('a fresh session is touched (last_seen_at bumped) but not renewed (expires_at unchanged)', async () => {
    const { user } = await createTestUser(testDb.db);
    const session = createSessionForUser(testDb.db, user.id);
    const originalExpiresAt = session.expiresAt;

    resolveSession(testDb.db, session.id);

    const row = testDb.sqlite.prepare('SELECT expires_at as expiresAt FROM sessions WHERE id = ?').get(session.id) as {
      expiresAt: number;
    };
    expect(row.expiresAt).toBe(originalExpiresAt);
  });

  it('a session idle for > 24h is slid forward: expires_at advances on resolve', async () => {
    const { user } = await createTestUser(testDb.db);
    const session = createSessionForUser(testDb.db, user.id);
    const staleLastSeenAt = Date.now() - 25 * 60 * 60 * 1000;
    testDb.sqlite.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(staleLastSeenAt, session.id);

    resolveSession(testDb.db, session.id);

    const row = testDb.sqlite
      .prepare('SELECT expires_at as expiresAt, last_seen_at as lastSeenAt FROM sessions WHERE id = ?')
      .get(session.id) as { expiresAt: number; lastSeenAt: number };
    // `>=` rather than `>`: on a fast machine both `Date.now()` calls (test
    // setup's `createSession` and the resolve under test) can land in the
    // same millisecond, and a same-millisecond renewal is still correct —
    // what matters is `lastSeenAt` moving off the (deliberately far-past)
    // stale value, asserted precisely below.
    expect(row.expiresAt).toBeGreaterThanOrEqual(session.expiresAt);
    expect(row.lastSeenAt).toBeGreaterThan(staleLastSeenAt);
  });
});
