import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addClap } from '../claps';
import { getOrCreateConversation } from '../conversations';
import { CommentDepthError, createComment } from '../comments';
import { followUser } from '../follows';
import { createUpload } from '../uploads';
import { createUser } from '../users';
import { createMigratedTestDb, type TestDb } from './helpers';
import { claps, conversations } from '../../schema';
import { createArticle } from '../articles';

/**
 * SPEC-002 acceptance: "Constraint tests pass: `claps.count` outside 1–50
 * rejected, `follows` self-row rejected, `uploads.bytes > 5242880`
 * rejected, `conversations.pair_key` duplicate insert rejected, a depth-2
 * comment reply rejected by [the write path]."
 */
describe('data integrity constraints (SPEC-002)', () => {
  let testDb: TestDb;
  let userA: string;
  let userB: string;
  let articleId: string;

  beforeAll(async () => {
    testDb = await createMigratedTestDb();

    const a = createUser(testDb.db, {
      email: 'a@example.com',
      passwordHash: 'x',
      handle: 'user_a',
      displayName: 'User A',
    });
    const b = createUser(testDb.db, {
      email: 'b@example.com',
      passwordHash: 'x',
      handle: 'user_b',
      displayName: 'User B',
    });
    userA = a.id;
    userB = b.id;

    const article = createArticle(testDb.db, {
      authorId: userA,
      slug: 'a-test-article',
      title: 'A Test Article',
      bodyJson: '{}',
      bodyHtml: '<p>Body</p>',
      excerpt: 'Body',
      wordCount: 1,
      readTimeMinutes: 1,
      status: 'published',
      publishedAt: Date.now(),
    });
    articleId = article.id;
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  it('rejects claps.count outside 1-50 at the DB level', () => {
    expect(() =>
      testDb.db
        .insert(claps)
        .values({
          articleId,
          userId: userA,
          count: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        .run(),
    ).toThrow();

    expect(() =>
      testDb.db
        .insert(claps)
        .values({
          articleId,
          userId: userA,
          count: 51,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        .run(),
    ).toThrow();
  });

  it('addClap clamps at 50 and never exceeds the DB-level bound', () => {
    const clap = addClap(testDb.db, articleId, userB, 999);
    expect(clap.count).toBe(50);
  });

  it('rejects a follows self-row at the DB level', () => {
    expect(() => followUser(testDb.db, userA, userA)).toThrow();
  });

  it('allows a normal follow between two distinct users', () => {
    expect(() => followUser(testDb.db, userA, userB)).not.toThrow();
  });

  it('rejects uploads.bytes > 5242880 at the DB level', () => {
    expect(() =>
      createUpload(testDb.db, {
        ownerId: userA,
        diskPath: '/tmp/too-big.png',
        mime: 'image/png',
        bytes: 5_242_881,
        kind: 'article_image',
      }),
    ).toThrow();
  });

  it('accepts uploads.bytes at exactly the 5242880 boundary', () => {
    expect(() =>
      createUpload(testDb.db, {
        ownerId: userA,
        diskPath: '/tmp/exactly-5mb.png',
        mime: 'image/png',
        bytes: 5_242_880,
        kind: 'article_image',
      }),
    ).not.toThrow();
  });

  it('rejects a duplicate conversations.pair_key insert', () => {
    const first = getOrCreateConversation(testDb.db, userA, userB);
    const second = getOrCreateConversation(testDb.db, userB, userA);
    // get-or-create is idempotent regardless of argument order...
    expect(second.id).toBe(first.id);

    // ...and a raw duplicate insert against the same pair_key is rejected
    // by the DB-level unique index.
    expect(() =>
      testDb.db
        .insert(conversations)
        .values({ pairKey: first.pairKey, createdAt: Date.now() })
        .run(),
    ).toThrow();
  });

  it('rejects a depth-2 comment reply (a reply to a reply)', () => {
    const topLevel = createComment(testDb.db, {
      articleId,
      authorId: userA,
      bodyText: 'Top-level comment',
    });
    const reply = createComment(testDb.db, {
      articleId,
      authorId: userB,
      parentId: topLevel.id,
      bodyText: 'A reply',
    });

    expect(() =>
      createComment(testDb.db, {
        articleId,
        authorId: userA,
        parentId: reply.id,
        bodyText: 'A reply to a reply',
      }),
    ).toThrow(CommentDepthError);
  });
});
