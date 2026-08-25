import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createComment,
  deleteComment,
  listTopLevelComments,
  listReplies,
  InvalidCommentBodyError,
  ParentNotFoundError,
  NotCommentAuthorError,
  CommentDepthError,
  BODY_MAX_LENGTH,
} from '../../src/server/services/comments';
import { getArticleById } from '../../src/server/db/repositories/articles';
import { createMigratedTestDb, makeArticle, makeUser, type TestDb } from './helpers';

describe('comments service (SPEC-007)', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('rejects a reply whose parentId points at a reply (depth 3), writes no row', () => {
    const author = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);
    const top = createComment(testDb.db, {
      articleId: article.id,
      authorId: author.id,
      bodyText: 'top level',
    });
    const reply = createComment(testDb.db, {
      articleId: article.id,
      authorId: author.id,
      bodyText: 'a reply',
      parentId: top.id,
    });

    const countBefore = testDb.sqlite
      .prepare('SELECT COUNT(*) as n FROM comments')
      .get() as { n: number };

    expect(() =>
      createComment(testDb.db, {
        articleId: article.id,
        authorId: author.id,
        bodyText: 'reply to a reply',
        parentId: reply.id,
      }),
    ).toThrow(CommentDepthError);

    const countAfter = testDb.sqlite.prepare('SELECT COUNT(*) as n FROM comments').get() as {
      n: number;
    };
    expect(countAfter.n).toBe(countBefore.n);
  });

  it('rejects a parentId belonging to a different article', () => {
    const author = makeUser(testDb.db);
    const articleA = makeArticle(testDb.db, author.id);
    const articleB = makeArticle(testDb.db, author.id);
    const topInA = createComment(testDb.db, {
      articleId: articleA.id,
      authorId: author.id,
      bodyText: 'top in A',
    });

    expect(() =>
      createComment(testDb.db, {
        articleId: articleB.id,
        authorId: author.id,
        bodyText: 'reply from B pointing at A',
        parentId: topInA.id,
      }),
    ).toThrow(ParentNotFoundError);
  });

  it('accepts a body of exactly 2000 chars, rejects 2001', () => {
    const author = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);

    const ok = createComment(testDb.db, {
      articleId: article.id,
      authorId: author.id,
      bodyText: 'a'.repeat(BODY_MAX_LENGTH),
    });
    expect(ok.bodyText).toHaveLength(2000);

    expect(() =>
      createComment(testDb.db, {
        articleId: article.id,
        authorId: author.id,
        bodyText: 'a'.repeat(BODY_MAX_LENGTH + 1),
      }),
    ).toThrow(InvalidCommentBodyError);

    expect(() =>
      createComment(testDb.db, { articleId: article.id, authorId: author.id, bodyText: '' }),
    ).toThrow(InvalidCommentBodyError);
  });

  it('deleting by a non-author, non-article-author is rejected; by the article author it soft-deletes', () => {
    const author = makeUser(testDb.db);
    const commenter = makeUser(testDb.db);
    const stranger = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);
    const comment = createComment(testDb.db, {
      articleId: article.id,
      authorId: commenter.id,
      bodyText: 'hello',
    });

    expect(() => deleteComment(testDb.db, comment.id, stranger.id)).toThrow(
      NotCommentAuthorError,
    );

    const deleted = deleteComment(testDb.db, comment.id, author.id);
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.bodyText).toBe('');
  });

  it('allows the comment author to delete their own comment', () => {
    const author = makeUser(testDb.db);
    const commenter = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);
    const comment = createComment(testDb.db, {
      articleId: article.id,
      authorId: commenter.id,
      bodyText: 'hello',
    });

    const deleted = deleteComment(testDb.db, comment.id, commenter.id);
    expect(deleted.deletedAt).not.toBeNull();
  });

  it('a soft-deleted top-level comment still returns its replies', () => {
    const author = makeUser(testDb.db);
    const commenter = makeUser(testDb.db);
    const replier = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);
    const top = createComment(testDb.db, {
      articleId: article.id,
      authorId: commenter.id,
      bodyText: 'top',
    });
    createComment(testDb.db, {
      articleId: article.id,
      authorId: replier.id,
      bodyText: 'a reply',
      parentId: top.id,
    });

    deleteComment(testDb.db, top.id, author.id);

    const replies = listReplies(testDb.db, top.id);
    expect(replies.items).toHaveLength(1);
    expect(replies.items[0]?.bodyText).toBe('a reply');
  });

  it('articles.comment_count equals the count of non-deleted comments after create/delete', () => {
    const author = makeUser(testDb.db);
    const commenter = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);

    const c1 = createComment(testDb.db, {
      articleId: article.id,
      authorId: commenter.id,
      bodyText: 'one',
    });
    createComment(testDb.db, { articleId: article.id, authorId: commenter.id, bodyText: 'two' });
    createComment(testDb.db, {
      articleId: article.id,
      authorId: commenter.id,
      bodyText: 'reply',
      parentId: c1.id,
    });

    expect(getArticleById(testDb.db, article.id)?.commentCount).toBe(3);

    deleteComment(testDb.db, c1.id, author.id);
    expect(getArticleById(testDb.db, article.id)?.commentCount).toBe(2);
  });

  it('lists top-level comments with preview replies and replyCount, oldest first', () => {
    const author = makeUser(testDb.db);
    const commenter = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);

    const top = createComment(testDb.db, {
      articleId: article.id,
      authorId: commenter.id,
      bodyText: 'top',
    });
    for (let i = 0; i < 5; i += 1) {
      createComment(testDb.db, {
        articleId: article.id,
        authorId: commenter.id,
        bodyText: `reply ${i}`,
        parentId: top.id,
      });
    }

    const page = listTopLevelComments(testDb.db, article.id);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.replyCount).toBe(5);
    expect(page.items[0]?.previewReplies).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });
});
