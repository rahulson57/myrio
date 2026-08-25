import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDraftHandler } from '../handler';
import { createMigratedTestDb, jsonRequest, loginTestUser, VALID_ORIGIN, type TestDb } from './testAuthHelpers';

describe('POST /api/drafts', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('creates an empty draft owned by the caller and returns 201', async () => {
    const { testUser, cookie } = await loginTestUser(testDb.db);
    const req = jsonRequest('http://localhost:4310/api/drafts', {
      origin: VALID_ORIGIN,
      cookie,
      body: {},
    });

    const res = await createDraftHandler(req, testDb.db);
    expect(res.status).toBe(201);

    const { article } = (await res.json()) as { article: { authorId: string; status: string } };
    expect(article.authorId).toBe(testUser.user.id);
    expect(article.status).toBe('draft');
  });

  it('requires a session (401 without a cookie)', async () => {
    const req = jsonRequest('http://localhost:4310/api/drafts', { origin: VALID_ORIGIN, body: {} });
    const res = await createDraftHandler(req, testDb.db);
    expect(res.status).toBe(401);
  });

  it('rejects a cross-origin request with 403', async () => {
    const { cookie } = await loginTestUser(testDb.db);
    const req = jsonRequest('http://localhost:4310/api/drafts', {
      origin: 'http://evil.example',
      cookie,
      body: {},
    });
    const res = await createDraftHandler(req, testDb.db);
    expect(res.status).toBe(403);
  });

  it('sanitizes bodyJson before it is ever stored', async () => {
    const { cookie } = await loginTestUser(testDb.db);
    const req = jsonRequest('http://localhost:4310/api/drafts', {
      origin: VALID_ORIGIN,
      cookie,
      body: { title: 'T', bodyJson: { type: 'doc', content: [{ type: 'script', content: [] }] } },
    });
    const res = await createDraftHandler(req, testDb.db);
    const { article } = (await res.json()) as { article: { bodyJson: string } };
    expect(article.bodyJson).not.toMatch(/script/);
  });

  it('rejects more than 5 tags with 400', async () => {
    const { cookie } = await loginTestUser(testDb.db);
    const req = jsonRequest('http://localhost:4310/api/drafts', {
      origin: VALID_ORIGIN,
      cookie,
      body: { tags: ['a', 'b', 'c', 'd', 'e', 'f'] },
    });
    const res = await createDraftHandler(req, testDb.db);
    expect(res.status).toBe(400);
  });
});
