import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addClap } from '../claps';
import { createArticle } from '../articles';
import { createComment } from '../comments';
import { getOrCreateConversation } from '../conversations';
import { followUser } from '../follows';
import { sendMessage } from '../messages';
import { createNotification } from '../notifications';
import { getOrCreateTag } from '../tags';
import { createUpload } from '../uploads';
import { createUser } from '../users';
import { createMigratedTestDb, type TestDb } from './helpers';

/**
 * SPEC-003 (Seed Data) requires two clean-DB seed runs to produce
 * byte-identical rows, including ids and timestamps — but every create
 * function in this module used to hardcode `Date.now()` and rely on
 * schema.ts's `$defaultFn(generateUuidV7)` (real `Date.now()` +
 * `crypto.randomBytes`), with no way for a caller to supply either. This
 * suite proves the optional overrides added for that requirement (DEC-011)
 * work, and that omitting them preserves today's random/real-time
 * behaviour exactly — no existing caller sees any change.
 */
describe('deterministic id/timestamp overrides (SPEC-003 DEC-011)', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('createUser: honours an explicit id/createdAt/updatedAt', () => {
    const user = createUser(testDb.db, {
      email: 'a@example.com',
      passwordHash: 'hash',
      handle: 'a',
      displayName: 'A',
      id: 'fixed-user-id',
      createdAt: 1000,
      updatedAt: 2000,
    });
    expect(user.id).toBe('fixed-user-id');
    expect(user.createdAt).toBe(1000);
    expect(user.updatedAt).toBe(2000);
  });

  it('createUser: omitting overrides preserves today\'s behaviour (random id, real timestamp)', () => {
    const before = Date.now();
    const user = createUser(testDb.db, {
      email: 'b@example.com',
      passwordHash: 'hash',
      handle: 'b',
      displayName: 'B',
    });
    expect(user.id).not.toBe('fixed-user-id');
    expect(user.id.length).toBeGreaterThan(0);
    expect(user.createdAt).toBeGreaterThanOrEqual(before);
  });

  it('createArticle: honours an explicit id/createdAt/updatedAt', () => {
    const author = createUser(testDb.db, {
      email: 'author@example.com',
      passwordHash: 'hash',
      handle: 'author',
      displayName: 'Author',
    });
    const article = createArticle(testDb.db, {
      authorId: author.id,
      title: 'T',
      bodyJson: '{}',
      slug: 'fixed-slug',
      bodyHtml: '<p></p>',
      excerpt: 'e',
      wordCount: 1000,
      readTimeMinutes: 5,
      status: 'published',
      publishedAt: 3000,
      id: 'fixed-article-id',
      createdAt: 3000,
      updatedAt: 3000,
    });
    expect(article.id).toBe('fixed-article-id');
    expect(article.createdAt).toBe(3000);
    expect(article.updatedAt).toBe(3000);
  });

  it('getOrCreateTag: honours an explicit id/createdAt on first creation, ignores it on a repeat hit', () => {
    const first = getOrCreateTag(testDb.db, 'Gothic Fiction', { id: 'fixed-tag-id', createdAt: 4000 });
    expect(first.id).toBe('fixed-tag-id');
    expect(first.createdAt).toBe(4000);

    const second = getOrCreateTag(testDb.db, 'Gothic Fiction', { id: 'a-different-id', createdAt: 9999 });
    expect(second.id).toBe('fixed-tag-id');
    expect(second.createdAt).toBe(4000);
  });

  it('addClap: honours an explicit id/createdAt/updatedAt on the insert branch and stamps the article counter with the same updatedAt', () => {
    const author = createUser(testDb.db, {
      email: 'author2@example.com',
      passwordHash: 'hash',
      handle: 'author2',
      displayName: 'Author2',
    });
    const article = createArticle(testDb.db, {
      authorId: author.id,
      title: 'T',
      bodyJson: '{}',
      slug: 'clap-slug',
      bodyHtml: '<p></p>',
      excerpt: 'e',
      wordCount: 1000,
      readTimeMinutes: 5,
      status: 'published',
    });
    const clap = addClap(testDb.db, article.id, author.id, 5, {
      id: 'fixed-clap-id',
      createdAt: 5000,
      updatedAt: 5000,
    });
    expect(clap.id).toBe('fixed-clap-id');
    expect(clap.createdAt).toBe(5000);
    expect(clap.updatedAt).toBe(5000);
  });

  it('createComment: honours an explicit id/createdAt', () => {
    const author = createUser(testDb.db, {
      email: 'author3@example.com',
      passwordHash: 'hash',
      handle: 'author3',
      displayName: 'Author3',
    });
    const article = createArticle(testDb.db, {
      authorId: author.id,
      title: 'T',
      bodyJson: '{}',
      slug: 'comment-slug',
      bodyHtml: '<p></p>',
      excerpt: 'e',
      wordCount: 1000,
      readTimeMinutes: 5,
      status: 'published',
    });
    const comment = createComment(testDb.db, {
      articleId: article.id,
      authorId: author.id,
      bodyText: 'hello',
      id: 'fixed-comment-id',
      createdAt: 6000,
    });
    expect(comment.id).toBe('fixed-comment-id');
    expect(comment.createdAt).toBe(6000);
  });

  it('followUser: honours an explicit createdAt (no id column to override)', () => {
    const a = createUser(testDb.db, { email: 'fa@example.com', passwordHash: 'h', handle: 'fa', displayName: 'FA' });
    const b = createUser(testDb.db, { email: 'fb@example.com', passwordHash: 'h', handle: 'fb', displayName: 'FB' });
    const follow = followUser(testDb.db, a.id, b.id, { createdAt: 7000 });
    expect(follow.createdAt).toBe(7000);
  });

  it('createUpload: honours an explicit id/createdAt', () => {
    const owner = createUser(testDb.db, { email: 'owner@example.com', passwordHash: 'h', handle: 'owner', displayName: 'Owner' });
    const upload = createUpload(testDb.db, {
      ownerId: owner.id,
      diskPath: '/public/uploads/seed/x.png',
      mime: 'image/png',
      bytes: 100,
      kind: 'article_image',
      id: 'fixed-upload-id',
      createdAt: 8000,
    });
    expect(upload.id).toBe('fixed-upload-id');
    expect(upload.createdAt).toBe(8000);
  });

  it('getOrCreateConversation: honours an explicit id/createdAt on first creation, ignores it on a repeat hit', () => {
    const a = createUser(testDb.db, { email: 'ca@example.com', passwordHash: 'h', handle: 'ca', displayName: 'CA' });
    const b = createUser(testDb.db, { email: 'cb@example.com', passwordHash: 'h', handle: 'cb', displayName: 'CB' });
    const first = getOrCreateConversation(testDb.db, a.id, b.id, { id: 'fixed-convo-id', createdAt: 9000 });
    expect(first.id).toBe('fixed-convo-id');
    expect(first.createdAt).toBe(9000);

    const second = getOrCreateConversation(testDb.db, a.id, b.id, { id: 'different', createdAt: 1 });
    expect(second.id).toBe('fixed-convo-id');
    expect(second.createdAt).toBe(9000);
  });

  it('sendMessage: honours an explicit id/createdAt', () => {
    const a = createUser(testDb.db, { email: 'ma@example.com', passwordHash: 'h', handle: 'ma', displayName: 'MA' });
    const b = createUser(testDb.db, { email: 'mb@example.com', passwordHash: 'h', handle: 'mb', displayName: 'MB' });
    const convo = getOrCreateConversation(testDb.db, a.id, b.id);
    const message = sendMessage(testDb.db, convo.id, a.id, 'hi', { id: 'fixed-message-id', createdAt: 10000 });
    expect(message.id).toBe('fixed-message-id');
    expect(message.createdAt).toBe(10000);
  });

  it('createNotification: honours an explicit id/createdAt', () => {
    const a = createUser(testDb.db, { email: 'na@example.com', passwordHash: 'h', handle: 'na', displayName: 'NA' });
    const b = createUser(testDb.db, { email: 'nb@example.com', passwordHash: 'h', handle: 'nb', displayName: 'NB' });
    const notification = createNotification(testDb.db, {
      userId: a.id,
      type: 'follow',
      actorId: b.id,
      id: 'fixed-notification-id',
      createdAt: 11000,
    });
    expect(notification?.id).toBe('fixed-notification-id');
    expect(notification?.createdAt).toBe(11000);
  });

  it('two independent seed-style runs against fresh DBs produce byte-identical rows given the same explicit values', async () => {
    const runOnce = (db: TestDb['db']) => {
      const user = createUser(db, {
        email: 'det@example.com',
        passwordHash: 'hash',
        handle: 'det',
        displayName: 'Det',
        id: 'det-user-id',
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      });
      const article = createArticle(db, {
        authorId: user.id,
        title: 'Deterministic Title',
        bodyJson: '{}',
        slug: 'deterministic-title',
        bodyHtml: '<p>x</p>',
        excerpt: 'x',
        wordCount: 1200,
        readTimeMinutes: 6,
        status: 'published',
        publishedAt: 1700000001000,
        id: 'det-article-id',
        createdAt: 1700000001000,
        updatedAt: 1700000001000,
      });
      return { user, article };
    };

    const dbA = await createMigratedTestDb();
    const dbB = await createMigratedTestDb();
    try {
      const resultA = runOnce(dbA.db);
      const resultB = runOnce(dbB.db);
      expect(resultA.user).toEqual(resultB.user);
      expect(resultA.article).toEqual(resultB.article);
    } finally {
      await dbA.cleanup();
      await dbB.cleanup();
    }
  });
});
