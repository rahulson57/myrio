import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createArticle } from '../articles';
import { createComment, getCommentById } from '../comments';
import { countFollowers, countFollowing, followUser } from '../follows';
import { createUser, updateUserProfile } from '../users';
import { createMigratedTestDb, type TestDb } from './helpers';

/**
 * Coverage for the additive Data Layer grants made to unblock Social Graph
 * (TASK-022): `getCommentById`/`countFollowers`/`countFollowing` (DEC-044)
 * and `UpdateUserProfileInput.handle` (DEC-047). The first two are new
 * functions mirroring an existing shape elsewhere; the third widens an
 * existing exported type by one optional field to expose a column
 * (`users.handle`) that already existed but wasn't writable on update.
 * `countFollowers`/`countFollowing` (follows.ts). Both mirror an existing
 * shape elsewhere in this file (getArticleById/getUserById/getUploadById,
 * and listFollowing respectively) — this file only tests the two new
 * exports, not the surrounding module (already covered by
 * repositories.test.ts and friends).
 */
describe('DEC-044 additive grants', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe('getCommentById', () => {
    it('returns the comment when it exists', () => {
      const author = createUser(testDb.db, {
        email: 'author@example.com',
        passwordHash: 'x',
        handle: 'author',
        displayName: 'Author',
      });
      const article = createArticle(testDb.db, {
        authorId: author.id,
        slug: 'a-slug',
        title: 'A Title',
        bodyJson: '{}',
        bodyHtml: '<p>Body</p>',
        excerpt: 'Body',
        wordCount: 1,
        readTimeMinutes: 1,
        status: 'published',
        publishedAt: Date.now(),
      });
      const comment = createComment(testDb.db, {
        articleId: article.id,
        authorId: author.id,
        bodyText: 'hello',
      });

      const found = getCommentById(testDb.db, comment.id);
      expect(found?.id).toBe(comment.id);
      expect(found?.bodyText).toBe('hello');
    });

    it('returns undefined for a missing id', () => {
      expect(getCommentById(testDb.db, 'does-not-exist')).toBeUndefined();
    });
  });

  describe('countFollowers / countFollowing', () => {
    it('counts followers of a user', () => {
      const author = createUser(testDb.db, {
        email: 'author2@example.com',
        passwordHash: 'x',
        handle: 'author2',
        displayName: 'Author 2',
      });
      const f1 = createUser(testDb.db, {
        email: 'f1@example.com',
        passwordHash: 'x',
        handle: 'follower1',
        displayName: 'Follower 1',
      });
      const f2 = createUser(testDb.db, {
        email: 'f2@example.com',
        passwordHash: 'x',
        handle: 'follower2',
        displayName: 'Follower 2',
      });

      expect(countFollowers(testDb.db, author.id)).toBe(0);

      followUser(testDb.db, f1.id, author.id);
      followUser(testDb.db, f2.id, author.id);

      expect(countFollowers(testDb.db, author.id)).toBe(2);
    });

    it('counts who a user follows', () => {
      const follower = createUser(testDb.db, {
        email: 'follower3@example.com',
        passwordHash: 'x',
        handle: 'follower3',
        displayName: 'Follower 3',
      });
      const a1 = createUser(testDb.db, {
        email: 'a1@example.com',
        passwordHash: 'x',
        handle: 'author3',
        displayName: 'Author 3',
      });
      const a2 = createUser(testDb.db, {
        email: 'a2@example.com',
        passwordHash: 'x',
        handle: 'author4',
        displayName: 'Author 4',
      });

      expect(countFollowing(testDb.db, follower.id)).toBe(0);

      followUser(testDb.db, follower.id, a1.id);
      followUser(testDb.db, follower.id, a2.id);

      expect(countFollowing(testDb.db, follower.id)).toBe(2);
    });
  });

  describe('updateUserProfile handle field (DEC-047)', () => {
    it('persists a new handle', () => {
      const user = createUser(testDb.db, {
        email: 'handle1@example.com',
        passwordHash: 'x',
        handle: 'oldhandle',
        displayName: 'Handle Tester',
      });

      const updated = updateUserProfile(testDb.db, user.id, { handle: 'newhandle' });
      expect(updated?.handle).toBe('newhandle');
    });

    it('raises a constraint error rather than silently succeeding when the handle is taken', () => {
      createUser(testDb.db, {
        email: 'taken@example.com',
        passwordHash: 'x',
        handle: 'takenhandle',
        displayName: 'First',
      });
      const second = createUser(testDb.db, {
        email: 'second@example.com',
        passwordHash: 'x',
        handle: 'secondhandle',
        displayName: 'Second',
      });

      // Documents the hazard DEC-047 flagged: `users.handle` is UNIQUE NOT
      // NULL, so this throws (SQLite constraint violation) instead of
      // returning undefined — callers (profiles.ts) must check
      // `getUserByHandle` themselves BEFORE calling this, which is exactly
      // what src/server/services/profiles.ts's `updateProfile` does.
      expect(() => updateUserProfile(testDb.db, second.id, { handle: 'takenhandle' })).toThrow();
    });
  });
});
