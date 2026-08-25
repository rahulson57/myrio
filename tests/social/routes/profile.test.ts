import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { patchProfile } from '../../../src/app/api/profile/handler';
import { getDrafts } from '../../../src/app/api/profile/drafts/handler';
import { resetHandleChangeTracker } from '../../../src/app/api/profile/_lib/tracker';
import {
  createMigratedTestDb,
  jsonRequest,
  makeArticle,
  makeUser,
  sessionCookieFor,
  VALID_ORIGIN,
  type TestDb,
} from './test-utils';

describe('PATCH /api/profile', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
    resetHandleChangeTracker();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('rejects a bio of 161 characters with 400; 160 succeeds', async () => {
    const user = makeUser(testDb.db);
    const cookie = sessionCookieFor(testDb.db, user.id);

    const tooLong = jsonRequest('http://localhost:4310/api/profile', {
      method: 'PATCH',
      origin: VALID_ORIGIN,
      cookie,
      body: { bio: 'a'.repeat(161) },
    });
    const resTooLong = await patchProfile(tooLong, testDb.db);
    expect(resTooLong.status).toBe(400);

    const ok = jsonRequest('http://localhost:4310/api/profile', {
      method: 'PATCH',
      origin: VALID_ORIGIN,
      cookie,
      body: { bio: 'a'.repeat(160) },
    });
    const resOk = await patchProfile(ok, testDb.db);
    expect(resOk.status).toBe(200);
  });

  it('returns 429 on a second handle change inside 30 days', async () => {
    const user = makeUser(testDb.db, { handle: 'original' });
    const cookie = sessionCookieFor(testDb.db, user.id);

    const first = jsonRequest('http://localhost:4310/api/profile', {
      method: 'PATCH',
      origin: VALID_ORIGIN,
      cookie,
      body: { handle: 'firstchange' },
    });
    const res1 = await patchProfile(first, testDb.db);
    expect(res1.status).toBe(200);

    const second = jsonRequest('http://localhost:4310/api/profile', {
      method: 'PATCH',
      origin: VALID_ORIGIN,
      cookie,
      body: { handle: 'secondchange' },
    });
    const res2 = await patchProfile(second, testDb.db);
    expect(res2.status).toBe(429);
  });

  it('never returns passwordHash', async () => {
    const user = makeUser(testDb.db);
    const cookie = sessionCookieFor(testDb.db, user.id);

    const req = jsonRequest('http://localhost:4310/api/profile', {
      method: 'PATCH',
      origin: VALID_ORIGIN,
      cookie,
      body: { displayName: 'New Name' },
    });
    const res = await patchProfile(req, testDb.db);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passwordHash).toBeUndefined();
    expect(body.displayName).toBe('New Name');
  });

  it('rejects an anonymous request with 401', async () => {
    const req = jsonRequest('http://localhost:4310/api/profile', {
      method: 'PATCH',
      origin: VALID_ORIGIN,
      body: { displayName: 'New Name' },
    });
    const res = await patchProfile(req, testDb.db);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/profile/drafts', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('returns the owner’s drafts for their own request', async () => {
    const owner = makeUser(testDb.db, { handle: 'owner1' });
    makeArticle(testDb.db, owner.id, { status: 'draft', publishedAt: null, slug: 'draft-1' });
    const cookie = sessionCookieFor(testDb.db, owner.id);

    const req = jsonRequest('http://localhost:4310/api/profile/drafts?handle=owner1', { cookie });
    const res = await getDrafts(req, testDb.db);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });

  it('rejects a non-owner request with 403', async () => {
    const owner = makeUser(testDb.db, { handle: 'owner2' });
    makeArticle(testDb.db, owner.id, { status: 'draft', publishedAt: null, slug: 'draft-2' });
    const stranger = makeUser(testDb.db);
    const cookie = sessionCookieFor(testDb.db, stranger.id);

    const req = jsonRequest('http://localhost:4310/api/profile/drafts?handle=owner2', { cookie });
    const res = await getDrafts(req, testDb.db);
    expect(res.status).toBe(403);
  });
});
