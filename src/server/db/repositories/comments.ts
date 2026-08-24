import { and, eq, isNull, sql } from 'drizzle-orm';
import type { MyrioDatabase } from '../client';
import { articles, comments } from '../schema';

export type Comment = typeof comments.$inferSelect;

/**
 * Thrown when a reply targets a comment that is itself a reply. SPEC-002
 * requires comments to be single-level ("a comment with parent_id != NULL
 * must have a parent whose parent_id IS NULL") and names
 * `src/server/services/comments.ts` as the enforcement point — that file
 * belongs to a later slice, outside this module's file scope. This
 * repository is the ONLY write path to the `comments` table (SPEC-002
 * module boundary: "every other module reaches SQLite through a repository
 * function exported here"), so the invariant is enforced here; a future
 * `services/comments.ts` calling `createComment` inherits the rejection.
 */
export class CommentDepthError extends Error {
  constructor() {
    super('Replies may only target a top-level comment (max depth 2).');
    this.name = 'CommentDepthError';
  }
}

export interface CreateCommentInput {
  articleId: string;
  authorId: string;
  parentId?: string | null;
  bodyText: string;
  /** Overrides the default `$defaultFn`-generated id (SPEC-003: the seed
   * pipeline supplies a deterministic UUIDv7 here; every other caller
   * omits this and gets today's random-id behaviour, unchanged). */
  id?: string;
  /** Overrides the default `Date.now()` stamp on `created_at` (SPEC-003
   * determinism). Omit for today's behaviour, unchanged. */
  createdAt?: number;
}

/**
 * Inserts a comment and updates `articles.comment_count` (a denormalized
 * count of non-deleted comments) in ONE transaction, per SPEC-002
 * Conventions — a throw partway through (e.g. the depth check below) rolls
 * both back via better-sqlite3's native transaction wrapper.
 */
export function createComment(db: MyrioDatabase, input: CreateCommentInput): Comment {
  return db.transaction((tx) => {
    const now = input.createdAt ?? Date.now();

    if (input.parentId) {
      const parent = tx.select().from(comments).where(eq(comments.id, input.parentId)).get();
      if (!parent) {
        throw new Error('Parent comment not found.');
      }
      if (parent.parentId !== null) {
        throw new CommentDepthError();
      }
    }

    const comment = tx
      .insert(comments)
      .values({
        ...(input.id !== undefined ? { id: input.id } : {}),
        articleId: input.articleId,
        authorId: input.authorId,
        parentId: input.parentId ?? null,
        bodyText: input.bodyText,
        createdAt: now,
      })
      .returning()
      .get();

    const countRow = tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(comments)
      .where(and(eq(comments.articleId, input.articleId), isNull(comments.deletedAt)))
      .get();

    tx.update(articles)
      .set({ commentCount: countRow?.count ?? 0, updatedAt: now })
      .where(eq(articles.id, input.articleId))
      .run();

    return comment;
  });
}

/**
 * Soft-deletes a comment: `deleted_at` is set and `body_text` cleared, the
 * row is kept so replies keep their anchor (SPEC-002). Updates
 * `articles.comment_count` in the same transaction.
 */
export function softDeleteComment(db: MyrioDatabase, id: string): Comment | undefined {
  return db.transaction((tx) => {
    const existing = tx.select().from(comments).where(eq(comments.id, id)).get();
    if (!existing || existing.deletedAt !== null) {
      return existing;
    }

    const now = Date.now();
    const updated = tx
      .update(comments)
      .set({ deletedAt: now, bodyText: '' })
      .where(eq(comments.id, id))
      .returning()
      .get();

    const countRow = tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(comments)
      .where(and(eq(comments.articleId, existing.articleId), isNull(comments.deletedAt)))
      .get();

    tx.update(articles)
      .set({ commentCount: countRow?.count ?? 0, updatedAt: now })
      .where(eq(articles.id, existing.articleId))
      .run();

    return updated;
  });
}

export function listCommentsForArticle(db: MyrioDatabase, articleId: string): Comment[] {
  return db
    .select()
    .from(comments)
    .where(eq(comments.articleId, articleId))
    .orderBy(comments.createdAt)
    .all();
}
