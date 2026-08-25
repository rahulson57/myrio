import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createUser, getUserById, updateUserPassword } from '../users';
import { createMigratedTestDb, type TestDb } from './helpers';

/**
 * Covers `updateUserPassword`, added to this repository for the Auth &
 * Session module (TASK-020) — see that task's proposal and the doc comment
 * on `updateUserPassword` in ../users.ts for why it exists. A new file
 * rather than an edit to repositories.test.ts, matching the precedent set
 * by ../__tests__/renew-session.test.ts (DEC-034) for the same class of
 * additive, out-of-file-scope change.
 */
describe('updateUserPassword', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('replaces password_hash and bumps updated_at, leaving every other column untouched', () => {
    const user = createUser(testDb.db, {
      email: 'reset@example.com',
      passwordHash: 'old-hash',
      handle: 'reset_user',
      displayName: 'Reset User',
      bio: 'unchanged bio',
    });

    // Ensure updatedAt has somewhere to move to.
    const originalUpdatedAt = user.updatedAt;

    const updated = updateUserPassword(testDb.db, user.id, 'new-hash');

    expect(updated).toBeDefined();
    expect(updated!.passwordHash).toBe('new-hash');
    expect(updated!.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
    expect(updated!.email).toBe(user.email);
    expect(updated!.handle).toBe(user.handle);
    expect(updated!.displayName).toBe(user.displayName);
    expect(updated!.bio).toBe(user.bio);
    expect(updated!.createdAt).toBe(user.createdAt);

    const fetched = getUserById(testDb.db, user.id);
    expect(fetched?.passwordHash).toBe('new-hash');
  });

  it('returns undefined for an id that does not exist', () => {
    expect(updateUserPassword(testDb.db, 'nonexistent-user-id', 'new-hash')).toBeUndefined();
  });
});
