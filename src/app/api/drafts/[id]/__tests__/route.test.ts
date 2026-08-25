import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDraftHandler, updateDraftHandler } from '../handler';
import { createDraft } from '../../../../../server/services/articles';
import { getArticleById } from '../../../../../server/db/repositories/articles';
import {
  createMigratedTestDb,
  jsonRequest,
  loginTestUser,
  VALID_ORIGIN,
  type TestDb,
} from '../../__tests__/testAuthHelpers';

describe('GET /api/drafts/:id', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it("returns the owner's draft", async () => {
    const { testUser, cookie } = await loginTestUser(testDb.db);
    const article = createDraft(testDb.db, { authorId: testUser.user.id, title: 'Mine' });

    const req = jsonRequest(`http://localhost:4310/api/drafts/${article.id}`, { method: 'GET', cookie });
    const res = await getDraftHandler(req, article.id, testDb.db);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { article: { title: string } };
    expect(body.article.title).toBe('Mine');
  });

  it("403s for another user's draft, 404s for a missing one", async () => {
    const { testUser } = await loginTestUser(testDb.db, { email: 'owner@example.com', handle: 'owner' });
    const article = createDraft(testDb.db, { authorId: testUser.user.id });
    const { cookie: strangerCookie } = await loginTestUser(testDb.db, { email: 'stranger@example.com', handle: 'stranger' });

    const forbiddenReq = jsonRequest(`http://localhost:4310/api/drafts/${article.id}`, {
      method: 'GET',
      cookie: strangerCookie,
    });
    expect((await getDraftHandler(forbiddenReq, article.id, testDb.db)).status).toBe(403);

    const notFoundReq = jsonRequest('http://localhost:4310/api/drafts/does-not-exist', {
      method: 'GET',
      cookie: strangerCookie,
    });
    expect((await getDraftHandler(notFoundReq, 'does-not-exist', testDb.db)).status).toBe(404);
  });
});

describe('PATCH /api/drafts/:id', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('autosaves a change and returns 200 with the updated article', async () => {
    const { testUser, cookie } = await loginTestUser(testDb.db);
    const article = createDraft(testDb.db, { authorId: testUser.user.id, title: 'Before' });

    const req = jsonRequest(`http://localhost:4310/api/drafts/${article.id}`, {
      method: 'PATCH',
      origin: VALID_ORIGIN,
      cookie,
      body: { title: 'After', baseVersion: article.updatedAt },
    });
    const res = await updateDraftHandler(req, article.id, testDb.db);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { article: { title: string } };
    expect(body.article.title).toBe('After');
  });

  it('returns 409 on a stale baseVersion and leaves updated_at/body_json unchanged (no silent overwrite)', async () => {
    const { testUser, cookie } = await loginTestUser(testDb.db);
    const article = createDraft(testDb.db, { authorId: testUser.user.id, title: 'Original' });
    const before = getArticleById(testDb.db, article.id)!;

    const req = jsonRequest(`http://localhost:4310/api/drafts/${article.id}`, {
      method: 'PATCH',
      origin: VALID_ORIGIN,
      cookie,
      body: { title: 'Hijacked', baseVersion: before.updatedAt - 1 },
    });
    const res = await updateDraftHandler(req, article.id, testDb.db);

    expect(res.status).toBe(409);
    const after = getArticleById(testDb.db, article.id)!;
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(after.bodyJson).toBe(before.bodyJson);
    expect(after.title).toBe('Original');
  });

  it('requires a session (401) and same-origin (403)', async () => {
    const { testUser, cookie } = await loginTestUser(testDb.db);
    const article = createDraft(testDb.db, { authorId: testUser.user.id });

    const noSessionReq = jsonRequest(`http://localhost:4310/api/drafts/${article.id}`, {
      method: 'PATCH',
      origin: VALID_ORIGIN,
      body: { baseVersion: article.updatedAt },
    });
    expect((await updateDraftHandler(noSessionReq, article.id, testDb.db)).status).toBe(401);

    const crossOriginReq = jsonRequest(`http://localhost:4310/api/drafts/${article.id}`, {
      method: 'PATCH',
      origin: 'http://evil.example',
      cookie,
      body: { baseVersion: article.updatedAt },
    });
    expect((await updateDraftHandler(crossOriginReq, article.id, testDb.db)).status).toBe(403);
  });

  it("403s when patching another user's draft", async () => {
    const { testUser } = await loginTestUser(testDb.db, { email: 'owner@example.com', handle: 'owner' });
    const article = createDraft(testDb.db, { authorId: testUser.user.id });
    const { cookie: strangerCookie } = await loginTestUser(testDb.db, { email: 'stranger@example.com', handle: 'stranger' });

    const req = jsonRequest(`http://localhost:4310/api/drafts/${article.id}`, {
      method: 'PATCH',
      origin: VALID_ORIGIN,
      cookie: strangerCookie,
      body: { baseVersion: article.updatedAt },
    });
    expect((await updateDraftHandler(req, article.id, testDb.db)).status).toBe(403);
  });

  it('rejects more than 5 tags with 400', async () => {
    const { testUser, cookie } = await loginTestUser(testDb.db);
    const article = createDraft(testDb.db, { authorId: testUser.user.id });

    const req = jsonRequest(`http://localhost:4310/api/drafts/${article.id}`, {
      method: 'PATCH',
      origin: VALID_ORIGIN,
      cookie,
      body: { tags: ['a', 'b', 'c', 'd', 'e', 'f'], baseVersion: article.updatedAt },
    });
    expect((await updateDraftHandler(req, article.id, testDb.db)).status).toBe(400);
  });
});
