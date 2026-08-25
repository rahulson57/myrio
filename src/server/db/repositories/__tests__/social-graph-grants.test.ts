import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createArticle } from '../articles';
import { createComment, getCommentById } from '../comments';
import { countFollowers, countFollowing, followUser } from '../follows';
import { createUser } from '../users';
import { createMigratedTestDb, type TestDb } from './helpers';

/**
 * Coverage for the two additive Data Layer grants made under DEC-044 to
 * unblock Social Graph (TASK-022): `getCommentById` (comments.ts) and
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
});
