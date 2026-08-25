import { getArticleById } from '../db/repositories/articles';
import { addClap, getClap } from '../db/repositories/claps';
import type { MyrioDatabase } from '../db/client';

/**
 * Claps service (SPEC-007 "Claps"). Thin business-logic layer over the
 * Data Layer `claps`/`articles` repositories: validates the per-request
 * `delta` and translates repository results into the `{ myCount, total }`
 * response shape the route handler returns. The per-user 50 cap and its
 * silent clamp, and the one-transaction clap-row + `clap_total` update, are
 * enforced by `src/server/db/repositories/claps.ts` (Data Layer) and the
 * `claps_count_range` CHECK constraint — this module does not re-implement
 * either.
 *
 * Self-clapping is allowed (SPEC-007) and this module never writes a
 * notification — Inbox (a later slice, out of this module's scope) owns
 * that surface entirely.
 */

export const CLAP_MIN_DELTA = 1;
export const CLAP_MAX_DELTA = 50;

export class InvalidClapDeltaError extends Error {
  constructor() {
    super(`delta must be an integer between ${CLAP_MIN_DELTA} and ${CLAP_MAX_DELTA}.`);
    this.name = 'InvalidClapDeltaError';
  }
}

export class ArticleNotFoundError extends Error {
  constructor() {
    super('Article not found.');
    this.name = 'ArticleNotFoundError';
  }
}

export interface ClapArticleResult {
  myCount: number;
  total: number;
}

/**
 * Validates `delta` is an integer in [1, 50] (SPEC-007: `POST
 * /api/articles/:id/claps` body `{ delta: number }` (1–50)), then adds it
 * to `userId`'s claps on `articleId`. The per-user total is capped at 50 by
 * the repository/DB layer and clamps silently rather than erroring
 * (SPEC-007's stated lossy-operation policy) — this function's job is only
 * to reject a malformed per-request `delta`, never a delta that would
 * merely clamp.
 */
export function clapArticle(
  db: MyrioDatabase,
  articleId: string,
  userId: string,
  delta: number,
): ClapArticleResult {
  if (!Number.isInteger(delta) || delta < CLAP_MIN_DELTA || delta > CLAP_MAX_DELTA) {
    throw new InvalidClapDeltaError();
  }

  const article = getArticleById(db, articleId);
  if (!article) {
    throw new ArticleNotFoundError();
  }

  const clap = addClap(db, articleId, userId, delta);
  const updated = getArticleById(db, articleId);

  return { myCount: clap.count, total: updated?.clapTotal ?? clap.count };
}

/** The requesting user's current clap count on `articleId`, or 0 if they haven't clapped. */
export function getMyClapCount(db: MyrioDatabase, articleId: string, userId: string): number {
  return getClap(db, articleId, userId)?.count ?? 0;
}
