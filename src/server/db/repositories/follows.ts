import { and, desc, eq } from 'drizzle-orm';
import type { MyrioDatabase } from '../client';
import { follows } from '../schema';

export type Follow = typeof follows.$inferSelect;

/**
 * Follows `followingId` from `followerId`. Self-follows are rejected by the
 * `follows_no_self` CHECK constraint at the DB level (SPEC-002).
 */
export function followUser(db: MyrioDatabase, followerId: string, followingId: string): Follow {
  return db
    .insert(follows)
    .values({ followerId, followingId, createdAt: Date.now() })
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
