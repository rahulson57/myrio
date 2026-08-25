import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createUser } from '../users';
import { createSession, getSessionById, renewSession } from '../sessions';
import { createMigratedTestDb, type TestDb } from './helpers';

/**
 * Covers `renewSession`, added to this repository for the Auth & Session
 * module (TASK-020) per DEC-034 — see that decision and the doc comment on
 * `renewSession` in ../sessions.ts for why it exists. A new file rather than
 * an edit to repositories.test.ts, so this additive, out-of-file-scope
 * change stays isolated and easy for review to scrutinize on its own.
 */
describe('renewSession', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('bumps both last_seen_at and expires_at to fresh 30-day values', () => {
    const user = createUser(testDb.db, {
      email: 'renew@example.com',
      passwordHash: 'hash',
      handle: 'renew_user',
      displayName: 'Renew User',
    });
    const session = createSession(testDb.db, user.id);

    // Force the stored row into "stale" territory so the renewal is a real,
    // observable change rather than a no-op that happens to look the same.
    const staleLastSeenAt = session.createdAt - 2 * 24 * 60 * 60 * 1000;
    const staleExpiresAt = session.createdAt + 60 * 1000;
    testDb.sqlite
      .prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
      .run(staleLastSeenAt, staleExpiresAt, session.id);

    const beforeRenew = getSessionById(testDb.db, session.id);
    expect(beforeRenew?.lastSeenAt).toBe(staleLastSeenAt);
    expect(beforeRenew?.expiresAt).toBe(staleExpiresAt);

    const renewed = renewSession(testDb.db, session.id);
    const now = Date.now();

    expect(renewed).toBeDefined();
    expect(renewed!.lastSeenAt).toBeGreaterThan(staleLastSeenAt);
    expect(renewed!.expiresAt).toBeGreaterThan(staleExpiresAt);
    // Pushed back out to ~30 days from now (allow a small execution-time slop).
    expect(renewed!.expiresAt).toBeGreaterThan(now + 29 * 24 * 60 * 60 * 1000);
    expect(renewed!.expiresAt).toBeLessThanOrEqual(now + 30 * 24 * 60 * 60 * 1000 + 5000);

    const fetched = getSessionById(testDb.db, session.id);
    expect(fetched?.lastSeenAt).toBe(renewed!.lastSeenAt);
    expect(fetched?.expiresAt).toBe(renewed!.expiresAt);
  });

  it('returns undefined for an id that does not exist', () => {
    expect(renewSession(testDb.db, 'nonexistent-session-id')).toBeUndefined();
  });
});
