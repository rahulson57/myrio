import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getProfileViewModel } from '../../../src/app/(profile)/profile/[handle]/view-model';
import { followUser } from '../../../src/server/db/repositories/follows';
import { createMigratedTestDb, makeArticle, makeUser, type TestDb } from '../helpers';

describe('getProfileViewModel', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('returns null for an unknown handle', () => {
    const vm = getProfileViewModel(testDb.db, 'nobody', null, undefined);
    expect(vm).toBeNull();
  });

  it('a non-owner sees isOwner=false, an empty drafts list, and cannot reach the drafts tab', () => {
    const owner = makeUser(testDb.db, { handle: 'author1' });
    makeArticle(testDb.db, owner.id, { status: 'draft', publishedAt: null, slug: 'secret-draft' });
    const viewer = makeUser(testDb.db);

    const vm = getProfileViewModel(testDb.db, 'author1', { userId: viewer.id, sessionId: 'x' }, 'drafts');
    expect(vm).not.toBeNull();
    expect(vm!.isOwner).toBe(false);
    // Requesting ?tab=drafts as a non-owner downgrades to 'articles', not
    // the private tab — the DOM-level "no Drafts tab" acceptance criterion
    // holds even against a direct URL guess, not just an absent link.
    expect(vm!.activeTab).toBe('articles');
    expect(vm!.drafts).toEqual([]);
  });

  it('the owner sees isOwner=true and their own drafts on the drafts tab', () => {
    const owner = makeUser(testDb.db, { handle: 'author2' });
    makeArticle(testDb.db, owner.id, { status: 'draft', publishedAt: null, slug: 'my-draft' });

    const vm = getProfileViewModel(testDb.db, 'author2', { userId: owner.id, sessionId: 'x' }, 'drafts');
    expect(vm!.isOwner).toBe(true);
    expect(vm!.activeTab).toBe('drafts');
    expect(vm!.drafts).toHaveLength(1);
  });

  it('an anonymous viewer sees isSignedIn=false and viewerFollows=false', () => {
    makeUser(testDb.db, { handle: 'author3' });
    const vm = getProfileViewModel(testDb.db, 'author3', null, undefined);
    expect(vm!.isSignedIn).toBe(false);
    expect(vm!.viewerFollows).toBe(false);
  });

  it('reflects an existing follow relationship and follower count', () => {
    const owner = makeUser(testDb.db, { handle: 'author4' });
    const follower = makeUser(testDb.db);
    followUser(testDb.db, follower.id, owner.id);

    const vm = getProfileViewModel(testDb.db, 'author4', { userId: follower.id, sessionId: 'x' }, undefined);
    expect(vm!.viewerFollows).toBe(true);
    expect(vm!.followerCount).toBe(1);
  });

  it('defaults to the articles tab and lists only published articles', () => {
    const owner = makeUser(testDb.db, { handle: 'author5' });
    makeArticle(testDb.db, owner.id, { status: 'published', slug: 'pub-1' });
    makeArticle(testDb.db, owner.id, { status: 'draft', publishedAt: null, slug: 'draft-1' });

    const vm = getProfileViewModel(testDb.db, 'author5', null, undefined);
    expect(vm!.activeTab).toBe('articles');
    expect(vm!.articles).toHaveLength(1);
    expect(vm!.articles[0]!.slug).toBe('pub-1');
  });
});
