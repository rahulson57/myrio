import { and, eq, sql } from 'drizzle-orm';
import type { MyrioDatabase } from '../client';
import { articles, claps } from '../schema';

export type Clap = typeof claps.$inferSelect;

const MAX_CLAP_COUNT = 50;

/**
 * Adds `delta` claps from `userId` on `articleId` (a user's claps on one
 * article are a single row whose `count` increments, capped at 50 — the
 * `claps.count` CHECK constraint enforces the same bound at the DB level).
 * Self-clapping is allowed (SPEC-002).
 *
 * The clap upsert and the `articles.clap_total` denormalized-counter update
 * happen in ONE transaction (SPEC-002 Conventions): if either statement
 * fails, better-sqlite3's native transaction wrapper rolls back both, so
 * the child row and the counter never diverge.
 */
export function addClap(
  db: MyrioDatabase,
  articleId: string,
  userId: string,
  delta: number,
): Clap {
  if (delta <= 0) {
    throw new Error('Clap delta must be a positive integer.');
  }

  return db.transaction((tx) => {
    const now = Date.now();
    const existing = tx
      .select()
      .from(claps)
      .where(and(eq(claps.articleId, articleId), eq(claps.userId, userId)))
      .get();

    const nextCount = Math.min(MAX_CLAP_COUNT, (existing?.count ?? 0) + delta);

    const clap = existing
      ? tx
          .update(claps)
          .set({ count: nextCount, updatedAt: now })
          .where(eq(claps.id, existing.id))
          .returning()
          .get()
      : tx
          .insert(claps)
          .values({ articleId, userId, count: nextCount, createdAt: now, updatedAt: now })
          .returning()
          .get();

    const totalRow = tx
      .select({ total: sql<number>`COALESCE(SUM(${claps.count}), 0)` })
      .from(claps)
      .where(eq(claps.articleId, articleId))
      .get();

    tx.update(articles)
      .set({ clapTotal: totalRow?.total ?? nextCount, updatedAt: now })
      .where(eq(articles.id, articleId))
      .run();

    return clap!;
  });
}

export function getClap(db: MyrioDatabase, articleId: string, userId: string): Clap | undefined {
  return db
    .select()
    .from(claps)
    .where(and(eq(claps.articleId, articleId), eq(claps.userId, userId)))
    .get();
}
