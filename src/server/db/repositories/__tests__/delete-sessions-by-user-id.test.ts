import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createUser } from '../users';
import { createSession, getSessionById, deleteSessionsByUserId } from '../sessions';
import { createMigratedTestDb, type TestDb } from './helpers';

/**
 * Covers `deleteSessionsByUserId`, added to this repository for the Auth &
 * Session module (TASK-020) per DEC-034 — see that decision and the doc
 * comment on `deleteSessionsByUserId` in ../sessions.ts. A new file rather
 * than an edit to repositories.test.ts, matching ../renew-session.test.ts's
 * precedent for this same class of additive, out-of-file-scope change.
 */
describe('deleteSessionsByUserId', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('deletes every session row for the given user, leaving other users untouched', () => {
    const userA = createUser(testDb.db, {
      email: 'a@example.com',
      passwordHash: 'hash-a',
      handle: 'user_a',
      displayName: 'User A',
    });
    const userB = createUser(testDb.db, {
      email: 'b@example.com',
      passwordHash: 'hash-b',
      handle: 'user_b',
      displayName: 'User B',
    });

    const sessionA1 = createSession(testDb.db, userA.id);
    const sessionA2 = createSession(testDb.db, userA.id);
    const sessionB = createSession(testDb.db, userB.id);

    deleteSessionsByUserId(testDb.db, userA.id);

    expect(getSessionById(testDb.db, sessionA1.id)).toBeUndefined();
    expect(getSessionById(testDb.db, sessionA2.id)).toBeUndefined();
    expect(getSessionById(testDb.db, sessionB.id)).toBeDefined();
  });

  it('is a no-op for a user with no sessions', () => {
    const user = createUser(testDb.db, {
      email: 'none@example.com',
      passwordHash: 'hash',
      handle: 'no_sessions',
      displayName: 'No Sessions',
    });
    expect(() => deleteSessionsByUserId(testDb.db, user.id)).not.toThrow();
  });
});
