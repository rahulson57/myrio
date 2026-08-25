import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteFollow, postFollow } from '../../../src/app/api/users/[handle]/follow/handler';
import {
  createMigratedTestDb,
  jsonRequest,
  makeUser,
  sessionCookieFor,
  VALID_ORIGIN,
  type TestDb,
} from './test-utils';

describe('POST /api/users/:handle/follow', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('is idempotent: two POSTs return following=true both times, one follows row, unchanged followerCount', async () => {
    const follower = makeUser(testDb.db);
    const target = makeUser(testDb.db, { handle: 'target' });
    const cookie = sessionCookieFor(testDb.db, follower.id);

    const req1 = jsonRequest('http://localhost:4310/api/users/target/follow', {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie,
    });
    const res1 = await postFollow(req1, 'target', testDb.db);
    expect(res1.status).toBe(200);
    expect(await res1.json()).toEqual({ following: true, followerCount: 1 });

    const req2 = jsonRequest('http://localhost:4310/api/users/target/follow', {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie,
    });
    const res2 = await postFollow(req2, 'target', testDb.db);
    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({ following: true, followerCount: 1 });

    const count = testDb.sqlite
      .prepare('SELECT COUNT(*) as n FROM follows WHERE follower_id = ? AND following_id = ?')
      .get(follower.id, target.id) as { n: number };
    expect(count.n).toBe(1);
  });

  it('rejects following yourself with 400 and writes no row', async () => {
    const user = makeUser(testDb.db, { handle: 'self' });
    const cookie = sessionCookieFor(testDb.db, user.id);

    const req = jsonRequest('http://localhost:4310/api/users/self/follow', {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie,
    });
    const res = await postFollow(req, 'self', testDb.db);
    expect(res.status).toBe(400);

    const count = testDb.sqlite.prepare('SELECT COUNT(*) as n FROM follows').get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('rejects an anonymous request with 401', async () => {
    makeUser(testDb.db, { handle: 'target2' });
    const req = jsonRequest('http://localhost:4310/api/users/target2/follow', {
      method: 'POST',
      origin: VALID_ORIGIN,
    });
    const res = await postFollow(req, 'target2', testDb.db);
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/users/:handle/follow', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('is idempotent: unfollowing twice both return following=false', async () => {
    const follower = makeUser(testDb.db);
    const target = makeUser(testDb.db, { handle: 'target3' });
    const cookie = sessionCookieFor(testDb.db, follower.id);

    const followReq = jsonRequest('http://localhost:4310/api/users/target3/follow', {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie,
    });
    await postFollow(followReq, 'target3', testDb.db);

    const del1 = jsonRequest('http://localhost:4310/api/users/target3/follow', {
      method: 'DELETE',
      origin: VALID_ORIGIN,
      cookie,
    });
    const res1 = await deleteFollow(del1, 'target3', testDb.db);
    expect(await res1.json()).toEqual({ following: false, followerCount: 0 });

    const del2 = jsonRequest('http://localhost:4310/api/users/target3/follow', {
      method: 'DELETE',
      origin: VALID_ORIGIN,
      cookie,
    });
    const res2 = await deleteFollow(del2, 'target3', testDb.db);
    expect(await res2.json()).toEqual({ following: false, followerCount: 0 });
  });
});
