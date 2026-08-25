import {
  followUser as repoFollowUser,
  unfollowUser as repoUnfollowUser,
  isFollowing,
  countFollowers,
  type Follow,
} from '../db/repositories/follows';
import type { MyrioDatabase } from '../db/client';

/**
 * Follows service (SPEC-007 "Follows"). Both mutating operations are
 * idempotent at this layer — the repository's `followUser` is a plain
 * insert (relying on the `(follower_id, following_id)` primary key to
 * reject a duplicate), so this module checks `isFollowing` first and
 * no-ops rather than letting a second POST hit a constraint violation.
 *
 * Follower counts are intentionally NOT denormalized (SPEC-007
 * "Derivation note"): `countFollowers` (DEC-044 grant on
 * `src/server/db/repositories/follows.ts`) computes `COUNT(*)` on every
 * read.
 */

export class SelfFollowError extends Error {
  constructor() {
    super('You cannot follow yourself.');
    this.name = 'SelfFollowError';
  }
}

export interface FollowResult {
  following: boolean;
  followerCount: number;
}

/**
 * Follows `followingId` from `followerId`. Idempotent: calling this twice
 * leaves exactly one `follows` row and returns `following: true` both
 * times (SPEC-007 acceptance criterion). Self-follow is rejected with
 * `SelfFollowError` (400) before any write — the DB's `follows_no_self`
 * CHECK is the backstop, not the primary guard, so the rejection is a
 * clean service-level error rather than a raw constraint failure.
 */
export function follow(db: MyrioDatabase, followerId: string, followingId: string): FollowResult {
  if (followerId === followingId) {
    throw new SelfFollowError();
  }

  if (!isFollowing(db, followerId, followingId)) {
    repoFollowUser(db, followerId, followingId);
  }

  return { following: true, followerCount: countFollowers(db, followingId) };
}

/** Idempotent unfollow — a second DELETE is a no-op and still returns `following: false`. */
export function unfollow(db: MyrioDatabase, followerId: string, followingId: string): FollowResult {
  repoUnfollowUser(db, followerId, followingId);
  return { following: false, followerCount: countFollowers(db, followingId) };
}

export type { Follow };
