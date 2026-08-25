import {
  CommentDepthError,
  createComment as repoCreateComment,
  softDeleteComment as repoSoftDeleteComment,
  listCommentsForArticle,
  type Comment,
} from '../db/repositories/comments';
import { getArticleById } from '../db/repositories/articles';
import type { MyrioDatabase } from '../db/client';

/**
 * Comments service (SPEC-007 "Comments"). Single-level only: top-level
 * comments and one tier of replies, no depth 3 — the repository already
 * rejects a reply-to-a-reply (`CommentDepthError`); this module adds the
 * remaining SPEC-007 rules the repository can't see on its own (body
 * length, the parent-must-belong-to-the-same-article check, pagination,
 * and delete authorization).
 */

export const BODY_MIN_LENGTH = 1;
export const BODY_MAX_LENGTH = 2000;
export const PAGE_SIZE = 20;
export const PREVIEW_REPLY_COUNT = 3;

export class InvalidCommentBodyError extends Error {
  constructor() {
    super(`bodyText must be ${BODY_MIN_LENGTH}-${BODY_MAX_LENGTH} characters.`);
    this.name = 'InvalidCommentBodyError';
  }
}

export class ArticleNotFoundError extends Error {
  constructor() {
    super('Article not found.');
    this.name = 'ArticleNotFoundError';
  }
}

export class ParentNotFoundError extends Error {
  constructor() {
    super('Parent comment not found on this article.');
    this.name = 'ParentNotFoundError';
  }
}

/** Thrown when a non-author, non-article-author tries to delete a comment (SPEC-007: 403). */
export class NotCommentAuthorError extends Error {
  constructor() {
    super('Only the comment author or the article author may delete this comment.');
    this.name = 'NotCommentAuthorError';
  }
}

export class CommentNotFoundError extends Error {
  constructor() {
    super('Comment not found.');
    this.name = 'CommentNotFoundError';
  }
}

export { CommentDepthError };

export interface CreateCommentServiceInput {
  articleId: string;
  authorId: string;
  bodyText: string;
  parentId?: string | null;
}

/**
 * Validates body length and (for a reply) that `parentId` names a
 * top-level comment belonging to the SAME article, then delegates to the
 * repository for the depth check + insert + `comment_count` update (one
 * transaction).
 *
 * `listCommentsForArticle` is used here — not a new repository query — to
 * find the parent by id, since the repository doesn't expose a
 * single-comment getter yet (tracked separately; see this task's proposal
 * notes for the pending `getCommentById` grant, which will replace this
 * lookup with an O(1) one instead of an O(article comment count) scan).
 */
export function createComment(db: MyrioDatabase, input: CreateCommentServiceInput): Comment {
  const trimmed = input.bodyText;
  if (trimmed.length < BODY_MIN_LENGTH || trimmed.length > BODY_MAX_LENGTH) {
    throw new InvalidCommentBodyError();
  }

  const article = getArticleById(db, input.articleId);
  if (!article) {
    throw new ArticleNotFoundError();
  }

  if (input.parentId) {
    const parent = listCommentsForArticle(db, input.articleId).find(
      (c) => c.id === input.parentId,
    );
    if (!parent) {
      throw new ParentNotFoundError();
    }
    // Same-article check is redundant with the scan above (it only looked
    // at this article's comments) but stated explicitly so the invariant
    // reads at the call site rather than being implied by the lookup.
    if (parent.articleId !== input.articleId) {
      throw new ParentNotFoundError();
    }
  }

  return repoCreateComment(db, {
    articleId: input.articleId,
    authorId: input.authorId,
    parentId: input.parentId ?? null,
    bodyText: trimmed,
  });
}

/**
 * Soft-deletes a comment. Only the comment's author or the article's
 * author may do so (SPEC-007: 403 otherwise). Looks the comment up via
 * `listCommentsForArticle`... but that needs an articleId, which the
 * caller (route handler, `DELETE /api/comments/:id`) doesn't have from the
 * URL alone. This is exactly the gap the pending `getCommentById` grant
 * closes — until it lands, callers must resolve articleId themselves (this
 * function accepts it explicitly rather than guessing).
 */
export function deleteComment(
  db: MyrioDatabase,
  commentId: string,
  articleId: string,
  requestingUserId: string,
): Comment {
  const comment = listCommentsForArticle(db, articleId).find((c) => c.id === commentId);
  if (!comment) {
    throw new CommentNotFoundError();
  }

  const article = getArticleById(db, articleId);
  if (!article) {
    throw new ArticleNotFoundError();
  }

  const isAuthor = comment.authorId === requestingUserId;
  const isArticleAuthor = article.authorId === requestingUserId;
  if (!isAuthor && !isArticleAuthor) {
    throw new NotCommentAuthorError();
  }

  const updated = repoSoftDeleteComment(db, commentId);
  if (!updated) {
    throw new CommentNotFoundError();
  }
  return updated;
}

export interface CommentCursor {
  createdAt: number;
  id: string;
}

export function encodeCommentCursor(cursor: CommentCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCommentCursor(raw: string): CommentCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as CommentCursor).createdAt === 'number' &&
      typeof (parsed as CommentCursor).id === 'string'
    ) {
      return parsed as CommentCursor;
    }
    return null;
  } catch {
    return null;
  }
}

function compareCursor(a: { createdAt: number; id: string }, b: { createdAt: number; id: string }): number {
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface TopLevelCommentDTO {
  id: string;
  articleId: string;
  authorId: string;
  bodyText: string;
  createdAt: number;
  deletedAt: number | null;
  replyCount: number;
  previewReplies: Comment[];
}

export interface CommentsPage {
  items: TopLevelCommentDTO[];
  nextCursor: string | null;
}

/**
 * Top-level comments for an article, `created_at ASC` (oldest first),
 * cursor-paginated at `PAGE_SIZE` (20), each carrying up to
 * `PREVIEW_REPLY_COUNT` (3) preview replies plus a full `replyCount`
 * (SPEC-007). Soft-deleted comments are NOT filtered out here — they
 * render as "This comment was deleted" and keep their replies attached
 * (SPEC-007); only `articles.comment_count` (a separate denormalized
 * counter) excludes them.
 *
 * Built over `listCommentsForArticle`'s flat result rather than a new
 * paginated repository query: at this project's stated scale (single
 * machine, ~90 seeded comments total across ~34 articles) an in-memory
 * filter/sort/slice over one article's comments is well within budget,
 * and avoids widening Data Layer's repository surface for a read shape
 * only this module needs.
 */
export function listTopLevelComments(
  db: MyrioDatabase,
  articleId: string,
  cursor?: string | null,
): CommentsPage {
  const all = listCommentsForArticle(db, articleId);
  const topLevel = all
    .filter((c) => c.parentId === null)
    .sort((a, b) => compareCursor(a, b));

  const decoded = cursor ? decodeCommentCursor(cursor) : null;
  const startIndex =
    decoded !== null ? topLevel.findIndex((c) => compareCursor(c, decoded) > 0) : 0;
  const remaining = startIndex === -1 ? [] : topLevel.slice(startIndex);

  const page = remaining.slice(0, PAGE_SIZE);
  const hasMore = remaining.length > PAGE_SIZE;

  const repliesByParent = new Map<string, Comment[]>();
  for (const c of all) {
    if (c.parentId === null) continue;
    const list = repliesByParent.get(c.parentId) ?? [];
    list.push(c);
    repliesByParent.set(c.parentId, list);
  }

  const items: TopLevelCommentDTO[] = page.map((c) => {
    const replies = (repliesByParent.get(c.id) ?? []).sort((a, b) => compareCursor(a, b));
    return {
      id: c.id,
      articleId: c.articleId,
      authorId: c.authorId,
      bodyText: c.bodyText,
      createdAt: c.createdAt,
      deletedAt: c.deletedAt,
      replyCount: replies.length,
      previewReplies: replies.slice(0, PREVIEW_REPLY_COUNT),
    };
  });

  const last = page.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? encodeCommentCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
}

export interface RepliesPage {
  items: Comment[];
  nextCursor: string | null;
}

/**
 * Full reply list for a top-level comment, `created_at ASC`,
 * cursor-paginated at `PAGE_SIZE` (SPEC-007: `GET
 * /api/comments/:id/replies`). Works whether or not the parent itself was
 * soft-deleted — replies stay attached regardless (SPEC-007 acceptance
 * criterion).
 */
export function listReplies(
  db: MyrioDatabase,
  articleId: string,
  parentId: string,
  cursor?: string | null,
): RepliesPage {
  const all = listCommentsForArticle(db, articleId);
  const replies = all
    .filter((c) => c.parentId === parentId)
    .sort((a, b) => compareCursor(a, b));

  const decoded = cursor ? decodeCommentCursor(cursor) : null;
  const startIndex =
    decoded !== null ? replies.findIndex((c) => compareCursor(c, decoded) > 0) : 0;
  const remaining = startIndex === -1 ? [] : replies.slice(startIndex);

  const page = remaining.slice(0, PAGE_SIZE);
  const hasMore = remaining.length > PAGE_SIZE;
  const last = page.at(-1);

  return {
    items: page,
    nextCursor: hasMore && last ? encodeCommentCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
}
