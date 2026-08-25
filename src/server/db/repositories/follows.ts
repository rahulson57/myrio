import { and, desc, eq } from 'drizzle-orm';
import type { MyrioDatabase } from '../client';
import { follows } from '../schema';

export type Follow = typeof follows.$inferSelect;

export interface FollowUserOverrides {
  /** Overrides the default `Date.now()` stamp on `created_at` (SPEC-003
   * determinism). Omit for today's behaviour, unchanged. */
  createdAt?: number;
}

/**
 * Follows `followingId` from `followerId`. Self-follows are rejected by the
 * `follows_no_self` CHECK constraint at the DB level (SPEC-002). `follows`
 * has no `id` column (its primary key is the `(follower_id,
 * following_id)` pair), so only `createdAt` is overridable.
 */
export function followUser(
  db: MyrioDatabase,
  followerId: string,
  followingId: string,
  overrides?: FollowUserOverrides,
): Follow {
  return db
    .insert(follows)
    .values({ followerId, followingId, createdAt: overrides?.createdAt ?? Date.now() })
    .returning()
    .get();
}

export function unfollowUser(db: MyrioDatabase, followerId: string, followingId: string): void {
  db.delete(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
    .run();
}

export function isFollowing(
  db: MyrioDatabase,
  followerId: string,
  followingId: string,
): boolean {
  return (
    db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
      .get() !== undefined
  );
}

/** Newest-first, served by `idx_follows_follower (follower_id, created_at DESC)`. */
export function listFollowing(db: MyrioDatabase, followerId: string): Follow[] {
  return db
    .select()
    .from(follows)
    .where(eq(follows.followerId, followerId))
    .orderBy(desc(follows.createdAt))
    .all();
}
