import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { follow, unfollow, SelfFollowError } from '../../src/server/services/follows';
import { follows } from '../../src/server/db/schema';
import { createMigratedTestDb, makeUser, type TestDb } from './helpers';

describe('follows service (SPEC-007)', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('following twice returns following=true both times, one row, unchanged followerCount', () => {
    const follower = makeUser(testDb.db);
    const author = makeUser(testDb.db);

    const first = follow(testDb.db, follower.id, author.id);
    expect(first).toEqual({ following: true, followerCount: 1 });

    const second = follow(testDb.db, follower.id, author.id);
    expect(second).toEqual({ following: true, followerCount: 1 });

    const rows = testDb.db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, follower.id), eq(follows.followingId, author.id)))
      .all();
    expect(rows).toHaveLength(1);
  });

  it('following yourself is rejected and writes no row', () => {
    const user = makeUser(testDb.db);

    expect(() => follow(testDb.db, user.id, user.id)).toThrow(SelfFollowError);

    const rows = testDb.db.select().from(follows).all();
    expect(rows).toHaveLength(0);
  });

  it('unfollow is idempotent', () => {
    const follower = makeUser(testDb.db);
    const author = makeUser(testDb.db);

    follow(testDb.db, follower.id, author.id);
    const first = unfollow(testDb.db, follower.id, author.id);
    expect(first).toEqual({ following: false, followerCount: 0 });

    const second = unfollow(testDb.db, follower.id, author.id);
    expect(second).toEqual({ following: false, followerCount: 0 });
  });

  it('followerCount reflects multiple followers', () => {
    const author = makeUser(testDb.db);
    const f1 = makeUser(testDb.db);
    const f2 = makeUser(testDb.db);
    const f3 = makeUser(testDb.db);

    follow(testDb.db, f1.id, author.id);
    follow(testDb.db, f2.id, author.id);
    const result = follow(testDb.db, f3.id, author.id);

    expect(result.followerCount).toBe(3);
  });
});
