import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { publishHandler } from '../handler';
import { createDraft } from '../../../../../../server/services/articles';
import {
  createMigratedTestDb,
  jsonRequest,
  loginTestUser,
  VALID_ORIGIN,
  type TestDb,
} from '../../../__tests__/testAuthHelpers';

function articleDoc() {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] };
}

describe('POST /api/drafts/:id/publish', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('publishes with 1-5 valid tags, a title and a non-empty body — 200', async () => {
    const { testUser, cookie } = await loginTestUser(testDb.db);
    const article = createDraft(testDb.db, {
      authorId: testUser.user.id,
      title: 'A Real Title',
      bodyJson: articleDoc(),
      tags: ['tech'],
    });

    const req = jsonRequest(`http://localhost:4310/api/drafts/${article.id}/publish`, { origin: VALID_ORIGIN, cookie });
    const res = await publishHandler(req, article.id, testDb.db);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { article: { status: string; publishedAt: number | null } };
    expect(body.article.status).toBe('published');
    expect(body.article.publishedAt).not.toBeNull();
  });

  it('returns 400 with a field-keyed error map for 0 tags', async () => {
    const { testUser, cookie } = await loginTestUser(testDb.db);
    const article = createDraft(testDb.db, { authorId: testUser.user.id, title: 'T', bodyJson: articleDoc() });

    const req = jsonRequest(`http://localhost:4310/api/drafts/${article.id}/publish`, { origin: VALID_ORIGIN, cookie });
    const res = await publishHandler(req, article.id, testDb.db);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: Record<string, string> };
    expect(body.error.tags).toBeTruthy();
  });

  it('returns 403 for a non-owner and 404 for a missing article', async () => {
    const { testUser } = await loginTestUser(testDb.db, { email: 'owner@example.com', handle: 'owner' });
    const article = createDraft(testDb.db, {
      authorId: testUser.user.id,
      title: 'T',
      bodyJson: articleDoc(),
      tags: ['a'],
    });
    const { cookie: strangerCookie } = await loginTestUser(testDb.db, {
      email: 'stranger@example.com',
      handle: 'stranger',
    });

    const forbiddenReq = jsonRequest(`http://localhost:4310/api/drafts/${article.id}/publish`, {
      origin: VALID_ORIGIN,
      cookie: strangerCookie,
    });
    expect((await publishHandler(forbiddenReq, article.id, testDb.db)).status).toBe(403);

    const notFoundReq = jsonRequest('http://localhost:4310/api/drafts/nope/publish', {
      origin: VALID_ORIGIN,
      cookie: strangerCookie,
    });
    expect((await publishHandler(notFoundReq, 'nope', testDb.db)).status).toBe(404);
  });
});
