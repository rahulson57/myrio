import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  updateProfile,
  createInMemoryHandleChangeTracker,
  ProfileValidationError,
  HandleRateLimitedError,
  BIO_MAX_LENGTH,
  type HandleChangeTracker,
} from '../../src/server/services/profiles';
import { createMigratedTestDb, makeUser, type TestDb } from './helpers';

describe('profiles service (SPEC-007)', () => {
  let testDb: TestDb;
  let tracker: HandleChangeTracker;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
    tracker = createInMemoryHandleChangeTracker();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('accepts a bio of exactly 160 chars, rejects 161', () => {
    const user = makeUser(testDb.db);

    const ok = updateProfile(testDb.db, user.id, { bio: 'a'.repeat(BIO_MAX_LENGTH) }, { tracker });
    expect(ok.bio).toHaveLength(160);

    expect(() =>
      updateProfile(testDb.db, user.id, { bio: 'a'.repeat(BIO_MAX_LENGTH + 1) }, { tracker }),
    ).toThrow(ProfileValidationError);
  });

  it('rejects a displayName outside 1-60 chars', () => {
    const user = makeUser(testDb.db);

    expect(() =>
      updateProfile(testDb.db, user.id, { displayName: '' }, { tracker }),
    ).toThrow(ProfileValidationError);
    expect(() =>
      updateProfile(testDb.db, user.id, { displayName: 'a'.repeat(61) }, { tracker }),
    ).toThrow(ProfileValidationError);
  });

  it('rejects a social website that is not a valid http(s) URL', () => {
    const user = makeUser(testDb.db);

    expect(() =>
      updateProfile(testDb.db, user.id, { socialWebsite: 'not a url' }, { tracker }),
    ).toThrow(ProfileValidationError);

    const ok = updateProfile(
      testDb.db,
      user.id,
      { socialWebsite: 'https://example.com' },
      { tracker },
    );
    expect(ok.socialWebsite).toBe('https://example.com');
  });

  it('rejects social handles that look like URLs', () => {
    const user = makeUser(testDb.db);

    expect(() =>
      updateProfile(
        testDb.db,
        user.id,
        { socialTwitter: 'https://twitter.com/foo' },
        { tracker },
      ),
    ).toThrow(ProfileValidationError);
  });

  it('a second handle change inside 30 days is rate-limited (429-shaped)', () => {
    const user = makeUser(testDb.db);
    const persistHandleChange = () => ({ ...user, handle: 'newhandle' });

    const t0 = Date.now();
    updateProfile(
      testDb.db,
      user.id,
      { handle: 'firsthandle' },
      { tracker, persistHandleChange: () => ({ ...user, handle: 'firsthandle' }), now: t0 },
    );

    expect(() =>
      updateProfile(
        testDb.db,
        user.id,
        { handle: 'secondhandle' },
        { tracker, persistHandleChange, now: t0 + 1000 },
      ),
    ).toThrow(HandleRateLimitedError);
  });

  it('allows a handle change after the 30-day cooldown has elapsed', () => {
    const user = makeUser(testDb.db);
    const t0 = Date.now();

    updateProfile(
      testDb.db,
      user.id,
      { handle: 'firsthandle' },
      { tracker, persistHandleChange: () => ({ ...user, handle: 'firsthandle' }), now: t0 },
    );

    const THIRTY_ONE_DAYS = 31 * 24 * 60 * 60 * 1000;
    expect(() =>
      updateProfile(
        testDb.db,
        user.id,
        { handle: 'secondhandle' },
        {
          tracker,
          persistHandleChange: () => ({ ...user, handle: 'secondhandle' }),
          now: t0 + THIRTY_ONE_DAYS,
        },
      ),
    ).not.toThrow();
  });

  it('rejects an invalid handle shape without touching the rate-limit clock', () => {
    const user = makeUser(testDb.db);

    expect(() =>
      updateProfile(testDb.db, user.id, { handle: 'AB' }, { tracker }),
    ).toThrow(ProfileValidationError);
    expect(tracker.getLastChangedAt(user.id)).toBeUndefined();
  });
});
