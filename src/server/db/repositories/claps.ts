import { and, eq, sql } from 'drizzle-orm';
import type { MyrioDatabase } from '../client';
import { articles, claps } from '../schema';

export type Clap = typeof claps.$inferSelect;

const MAX_CLAP_COUNT = 50;

export interface AddClapOverrides {
  /** Overrides the default `$defaultFn`-generated id (SPEC-003: the seed
   * pipeline supplies a deterministic UUIDv7 here). Only applied on the
   * insert branch — a delta on an existing clap row ignores it. */
  id?: string;
  /** Overrides the default `Date.now()` stamp on `created_at`/`updated_at`
   * (SPEC-003 determinism). Omit for today's behaviour, unchanged. */
  createdAt?: number;
  updatedAt?: number;
}

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
  overrides?: AddClapOverrides,
): Clap {
  if (delta <= 0) {
    throw new Error('Clap delta must be a positive integer.');
  }

  return db.transaction((tx) => {
    const now = Date.now();
    const createdAt = overrides?.createdAt ?? now;
    const updatedAt = overrides?.updatedAt ?? now;
    const existing = tx
      .select()
      .from(claps)
      .where(and(eq(claps.articleId, articleId), eq(claps.userId, userId)))
      .get();

    const nextCount = Math.min(MAX_CLAP_COUNT, (existing?.count ?? 0) + delta);

    const clap = existing
      ? tx
          .update(claps)
          .set({ count: nextCount, updatedAt })
          .where(eq(claps.id, existing.id))
          .returning()
          .get()
      : tx
          .insert(claps)
          .values({
            ...(overrides?.id !== undefined ? { id: overrides.id } : {}),
            articleId,
            userId,
            count: nextCount,
            createdAt,
            updatedAt,
          })
          .returning()
          .get();

    const totalRow = tx
      .select({ total: sql<number>`COALESCE(SUM(${claps.count}), 0)` })
      .from(claps)
      .where(eq(claps.articleId, articleId))
      .get();

    tx.update(articles)
      .set({ clapTotal: totalRow?.total ?? nextCount, updatedAt })
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
