import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getComments, postComment } from '../../../src/app/api/articles/[id]/comments/handler';
import { deleteCommentHandler } from '../../../src/app/api/comments/[id]/handler';
import { getReplies } from '../../../src/app/api/comments/[id]/replies/handler';
import { getArticleById } from '../../../src/server/db/repositories/articles';
import {
  createMigratedTestDb,
  jsonRequest,
  makeArticle,
  makeUser,
  sessionCookieFor,
  VALID_ORIGIN,
  type TestDb,
} from './test-utils';

describe('POST /api/articles/:id/comments', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('creates a top-level comment and returns it enriched with author fields', async () => {
    const author = makeUser(testDb.db);
    const commenter = makeUser(testDb.db, { handle: 'commenter', displayName: 'Commenter Name' });
    const article = makeArticle(testDb.db, author.id);
    const cookie = sessionCookieFor(testDb.db, commenter.id);

    const req = jsonRequest(`http://localhost:4310/api/articles/${article.id}/comments`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie,
      body: { bodyText: 'Great article!' },
    });
    const res = await postComment(req, article.id, testDb.db);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      authorHandle: 'commenter',
      authorDisplayName: 'Commenter Name',
      bodyText: 'Great article!',
      deletedAt: null,
    });
  });

  it('rejects bodyText of 2001 characters with 400; 2000 succeeds', async () => {
    const author = makeUser(testDb.db);
    const commenter = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);
    const cookie = sessionCookieFor(testDb.db, commenter.id);

    const tooLong = jsonRequest(`http://localhost:4310/api/articles/${article.id}/comments`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie,
      body: { bodyText: 'a'.repeat(2001) },
    });
    const resTooLong = await postComment(tooLong, article.id, testDb.db);
    expect(resTooLong.status).toBe(400);

    const ok = jsonRequest(`http://localhost:4310/api/articles/${article.id}/comments`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie,
      body: { bodyText: 'a'.repeat(2000) },
    });
    const resOk = await postComment(ok, article.id, testDb.db);
    expect(resOk.status).toBe(201);
  });

  it('rejects a parentId pointing at a reply (depth 2) with 400 and writes no row', async () => {
    const author = makeUser(testDb.db);
    const commenter = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);
    const cookie = sessionCookieFor(testDb.db, commenter.id);

    const topReq = jsonRequest(`http://localhost:4310/api/articles/${article.id}/comments`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie,
      body: { bodyText: 'Top level' },
    });
    const topRes = await postComment(topReq, article.id, testDb.db);
    const top = await topRes.json();

    const replyReq = jsonRequest(`http://localhost:4310/api/articles/${article.id}/comments`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie,
      body: { bodyText: 'A reply', parentId: top.id },
    });
    const replyRes = await postComment(replyReq, article.id, testDb.db);
    expect(replyRes.status).toBe(201);
    const reply = await replyRes.json();

    const before = testDb.sqlite.prepare('SELECT COUNT(*) as n FROM comments').get() as { n: number };

    const replyToReplyReq = jsonRequest(`http://localhost:4310/api/articles/${article.id}/comments`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie,
      body: { bodyText: 'Reply to a reply', parentId: reply.id },
    });
    const res = await postComment(replyToReplyReq, article.id, testDb.db);
    expect(res.status).toBe(400);

    const after = testDb.sqlite.prepare('SELECT COUNT(*) as n FROM comments').get() as { n: number };
    expect(after.n).toBe(before.n);
  });

  it('keeps articles.comment_count equal to non-deleted comments after create/delete', async () => {
    const author = makeUser(testDb.db);
    const commenter = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);
    const cookie = sessionCookieFor(testDb.db, commenter.id);

    const req1 = jsonRequest(`http://localhost:4310/api/articles/${article.id}/comments`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie,
      body: { bodyText: 'One' },
    });
    const res1 = await postComment(req1, article.id, testDb.db);
    const c1 = await res1.json();

    const req2 = jsonRequest(`http://localhost:4310/api/articles/${article.id}/comments`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie,
      body: { bodyText: 'Two' },
    });
    await postComment(req2, article.id, testDb.db);

    expect(getArticleById(testDb.db, article.id)?.commentCount).toBe(2);

    const delReq = jsonRequest(`http://localhost:4310/api/comments/${c1.id}`, {
      method: 'DELETE',
      origin: VALID_ORIGIN,
      cookie,
    });
    const delRes = await deleteCommentHandler(delReq, c1.id, testDb.db);
    expect(delRes.status).toBe(200);

    expect(getArticleById(testDb.db, article.id)?.commentCount).toBe(1);
  });
});

describe('GET /api/articles/:id/comments', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('renders a `<script>` comment body as literal text (no markup), not executable', async () => {
    const author = makeUser(testDb.db);
    const commenter = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);
    const cookie = sessionCookieFor(testDb.db, commenter.id);

    const payload = '<script>alert(1)</script>';
    const postReq = jsonRequest(`http://localhost:4310/api/articles/${article.id}/comments`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie,
      body: { bodyText: payload },
    });
    await postComment(postReq, article.id, testDb.db);

    const getReq = jsonRequest(`http://localhost:4310/api/articles/${article.id}/comments`);
    const res = await getComments(getReq, article.id, testDb.db);
    const body = await res.json();
    // Stored/returned as the literal string — CommentItem renders it as a
    // plain React child (never dangerouslySetInnerHTML), which is what
    // actually prevents script execution; this asserts the API never
    // strips/escapes it into something else either.
    expect(body.items[0].bodyText).toBe(payload);
  });
});

describe('GET /api/comments/:id/replies', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('still returns replies for a soft-deleted top-level comment', async () => {
    const author = makeUser(testDb.db);
    const commenter = makeUser(testDb.db);
    const replier = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);
    const commenterCookie = sessionCookieFor(testDb.db, commenter.id);
    const replierCookie = sessionCookieFor(testDb.db, replier.id);

    const topReq = jsonRequest(`http://localhost:4310/api/articles/${article.id}/comments`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie: commenterCookie,
      body: { bodyText: 'Top level' },
    });
    const topRes = await postComment(topReq, article.id, testDb.db);
    const top = await topRes.json();

    const replyReq = jsonRequest(`http://localhost:4310/api/articles/${article.id}/comments`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie: replierCookie,
      body: { bodyText: 'A reply', parentId: top.id },
    });
    await postComment(replyReq, article.id, testDb.db);

    const delReq = jsonRequest(`http://localhost:4310/api/comments/${top.id}`, {
      method: 'DELETE',
      origin: VALID_ORIGIN,
      cookie: commenterCookie,
    });
    await deleteCommentHandler(delReq, top.id, testDb.db);

    const repliesReq = jsonRequest(`http://localhost:4310/api/comments/${top.id}/replies`);
    const res = await getReplies(repliesReq, top.id, testDb.db);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].bodyText).toBe('A reply');
  });
});

describe('DELETE /api/comments/:id', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('rejects a non-author, non-article-author with 403', async () => {
    const author = makeUser(testDb.db);
    const commenter = makeUser(testDb.db);
    const stranger = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);
    const commenterCookie = sessionCookieFor(testDb.db, commenter.id);
    const strangerCookie = sessionCookieFor(testDb.db, stranger.id);

    const postReq = jsonRequest(`http://localhost:4310/api/articles/${article.id}/comments`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie: commenterCookie,
      body: { bodyText: 'Mine' },
    });
    const postRes = await postComment(postReq, article.id, testDb.db);
    const comment = await postRes.json();

    const delReq = jsonRequest(`http://localhost:4310/api/comments/${comment.id}`, {
      method: 'DELETE',
      origin: VALID_ORIGIN,
      cookie: strangerCookie,
    });
    const res = await deleteCommentHandler(delReq, comment.id, testDb.db);
    expect(res.status).toBe(403);
  });

  it('allows the article author to delete, sets deleted_at and blanks body_text', async () => {
    const author = makeUser(testDb.db);
    const commenter = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);
    const commenterCookie = sessionCookieFor(testDb.db, commenter.id);
    const authorCookie = sessionCookieFor(testDb.db, author.id);

    const postReq = jsonRequest(`http://localhost:4310/api/articles/${article.id}/comments`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie: commenterCookie,
      body: { bodyText: "Someone else's comment" },
    });
    const postRes = await postComment(postReq, article.id, testDb.db);
    const comment = await postRes.json();

    const delReq = jsonRequest(`http://localhost:4310/api/comments/${comment.id}`, {
      method: 'DELETE',
      origin: VALID_ORIGIN,
      cookie: authorCookie,
    });
    const res = await deleteCommentHandler(delReq, comment.id, testDb.db);
    expect(res.status).toBe(200);

    const row = testDb.sqlite.prepare('SELECT deleted_at, body_text FROM comments WHERE id = ?').get(comment.id) as {
      deleted_at: number | null;
      body_text: string;
    };
    expect(row.deleted_at).not.toBeNull();
    expect(row.body_text).toBe('');
  });
});
