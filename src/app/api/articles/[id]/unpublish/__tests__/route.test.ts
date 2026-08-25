import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { unpublishHandler } from '../handler';
import { createDraft, publishArticle } from '../../../../../../server/services/articles';
import {
  createMigratedTestDb,
  jsonRequest,
  loginTestUser,
  VALID_ORIGIN,
  type TestDb,
} from '../../../../drafts/__tests__/testAuthHelpers';

function articleDoc() {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] };
}

describe('POST /api/articles/:id/unpublish', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('moves a published article back to draft, keeping slug/published_at, and republish restores byte-identical values', async () => {
    const { testUser, cookie } = await loginTestUser(testDb.db);
    const article = createDraft(testDb.db, {
      authorId: testUser.user.id,
      title: 'T',
      bodyJson: articleDoc(),
      tags: ['a'],
    });
    const published = publishArticle(testDb.db, article.id, testUser.user.id);
    if (!published.ok) throw new Error('setup: expected publish to succeed');

    const req = jsonRequest(`http://localhost:4310/api/articles/${article.id}/unpublish`, {
      origin: VALID_ORIGIN,
      cookie,
    });
    const res = await unpublishHandler(req, article.id, testDb.db);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { article: { status: string; slug: string; publishedAt: number } };
    expect(body.article.status).toBe('draft');
    expect(body.article.slug).toBe(published.article.slug);
    expect(body.article.publishedAt).toBe(published.article.publishedAt);

    const republished = publishArticle(testDb.db, article.id, testUser.user.id);
    if (!republished.ok) throw new Error('expected republish to succeed');
    expect(republished.article.slug).toBe(published.article.slug);
    expect(republished.article.publishedAt).toBe(published.article.publishedAt);
  });

  it('returns 409 for a draft that was never published', async () => {
    const { testUser, cookie } = await loginTestUser(testDb.db);
    const article = createDraft(testDb.db, { authorId: testUser.user.id });

    const req = jsonRequest(`http://localhost:4310/api/articles/${article.id}/unpublish`, {
      origin: VALID_ORIGIN,
      cookie,
    });
    expect((await unpublishHandler(req, article.id, testDb.db)).status).toBe(409);
  });

  it('returns 403 for a non-owner and 404 for a missing article', async () => {
    const { testUser } = await loginTestUser(testDb.db, { email: 'owner@example.com', handle: 'owner' });
    const article = createDraft(testDb.db, {
      authorId: testUser.user.id,
      title: 'T',
      bodyJson: articleDoc(),
      tags: ['a'],
    });
    publishArticle(testDb.db, article.id, testUser.user.id);
    const { cookie: strangerCookie } = await loginTestUser(testDb.db, {
      email: 'stranger@example.com',
      handle: 'stranger',
    });

    const forbiddenReq = jsonRequest(`http://localhost:4310/api/articles/${article.id}/unpublish`, {
      origin: VALID_ORIGIN,
      cookie: strangerCookie,
    });
    expect((await unpublishHandler(forbiddenReq, article.id, testDb.db)).status).toBe(403);

    const notFoundReq = jsonRequest('http://localhost:4310/api/articles/nope/unpublish', {
      origin: VALID_ORIGIN,
      cookie: strangerCookie,
    });
    expect((await unpublishHandler(notFoundReq, 'nope', testDb.db)).status).toBe(404);
  });
});
