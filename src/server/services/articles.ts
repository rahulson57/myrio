/**
 * Article Core's write-path service (SPEC-005 "Publish state machine",
 * "Autosave contract", "Sanitization contract"). This is the ONE place
 * `sanitizeArticleDocument` + `deriveArticleFields` are invoked around a
 * Data Layer write — every route handler under `src/app/api/drafts/**`
 * and `src/app/api/articles/[id]/unpublish/**` calls into this module
 * rather than touching repositories directly.
 *
 * Deliberately decoupled from HTTP/session concerns: every function here
 * takes `authorId` as an explicit parameter rather than resolving it from
 * a request/cookie itself. The route handlers are responsible for calling
 * `requireUser`/`getSession` (SPEC-004, `src/server/auth/session.ts`) and
 * passing the resolved `userId` in — that keeps this module fully unit
 * testable against a plain `MyrioDatabase` with no HTTP layer involved.
 */

import type { MyrioDatabase } from '../db/client';
import { generateUuidV7 } from '../db/schema';
import {
  createArticle,
  getArticleById,
  updateArticle,
  type Article,
} from '../db/repositories/articles';
import { listTagsForArticle, setArticleTags, type Tag } from '../db/repositories/tags';
import { getUploadById } from '../db/repositories/uploads';
import { deriveArticleFields } from '../../lib/article/derive';
import {
  collectReferencedUploadIds,
  hasNonEmptyBlock,
  sanitizeArticleDocument,
} from '../../lib/article/schema';

const MAX_TAGS = 5;
const MIN_TAGS_TO_PUBLISH = 1;
const TITLE_MAX_CHARS = 120;

export interface CreateDraftInput {
  authorId: string;
  title?: string;
  subtitle?: string | null;
  bodyJson?: unknown;
  tags?: string[];
  coverUploadId?: string | null;
}

export function createDraft(db: MyrioDatabase, input: CreateDraftInput): Article {
  const id = generateUuidV7();
  const title = input.title ?? '';
  const cleanBodyJson = sanitizeArticleDocument(input.bodyJson);
  const derived = deriveArticleFields(cleanBodyJson, { title, id });

  const article = createArticle(db, {
    id,
    authorId: input.authorId,
    title,
    subtitle: input.subtitle ?? null,
    bodyJson: JSON.stringify(cleanBodyJson),
    coverUploadId: input.coverUploadId ?? null,
    status: 'draft',
    publishedAt: null,
    ...derived,
  });

  if (input.tags && input.tags.length > 0) {
    // A draft is allowed to be transiently "invalid" (that's the point of
    // draft vs. publish validation) but setArticleTags (Data Layer) hard-
    // refuses more than MAX_TAGS regardless — fail loudly here rather than
    // silently drop tags the author actually typed.
    if (input.tags.length > MAX_TAGS) {
      throw new RangeError(`An article may have at most ${MAX_TAGS} tags.`);
    }
    setArticleTags(db, id, input.tags);
  }

  return article;
}

export type DraftWriteFailure =
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'forbidden' }
  | { ok: false; reason: 'conflict' }
  | { ok: false; reason: 'too_many_tags' };

export interface UpdateDraftInput {
  title?: string;
  subtitle?: string | null;
  bodyJson?: unknown;
  tags?: string[];
  coverUploadId?: string | null;
  /** Optimistic-lock token — must equal the article's current
   * `updated_at` (`articles.updated_at`, ms epoch) or the update is
   * rejected with `{ ok: false, reason: 'conflict' }` and NOTHING is
   * written (SPEC-005 autosave contract: "no silent overwrite"). */
  baseVersion: number;
}

export type UpdateDraftResult = { ok: true; article: Article } | DraftWriteFailure;

/**
 * The autosave write path (`PATCH /api/drafts/:id`). Works for both draft
 * and already-published articles (SPEC-005: "Published --> Published:
 * PATCH (edit in place, updated_at bumped)") — the only difference is that
 * a published article's `slug` is never overwritten by a fresh derivation
 * (SPEC-002 "slug ... frozen at first publish").
 */
export function updateDraft(
  db: MyrioDatabase,
  articleId: string,
  authorId: string,
  input: UpdateDraftInput,
): UpdateDraftResult {
  const existing = getArticleById(db, articleId);
  if (!existing) return { ok: false, reason: 'not_found' };
  if (existing.authorId !== authorId) return { ok: false, reason: 'forbidden' };
  // Checked BEFORE any write: a stale baseVersion must leave
  // articles.updated_at and body_json byte-identical to before the call.
  if (existing.updatedAt !== input.baseVersion) return { ok: false, reason: 'conflict' };
  // Checked before any write, same as the conflict check above — a
  // too-many-tags request must not partially apply.
  if (input.tags !== undefined && input.tags.length > MAX_TAGS) {
    return { ok: false, reason: 'too_many_tags' };
  }

  const title = input.title ?? existing.title;
  const rawBodyJson = input.bodyJson !== undefined ? input.bodyJson : JSON.parse(existing.bodyJson);
  const cleanBodyJson = sanitizeArticleDocument(rawBodyJson);
  const derived = deriveArticleFields(cleanBodyJson, { title, id: existing.id });

  const article = updateArticle(db, articleId, {
    title,
    subtitle: input.subtitle !== undefined ? input.subtitle : existing.subtitle,
    coverUploadId: input.coverUploadId !== undefined ? input.coverUploadId : existing.coverUploadId,
    bodyJson: JSON.stringify(cleanBodyJson),
    bodyHtml: derived.bodyHtml,
    excerpt: derived.excerpt,
    wordCount: derived.wordCount,
    readTimeMinutes: derived.readTimeMinutes,
    // Frozen once published; only a still-draft article picks up a fresh
    // slug derivation (harmless — nothing links to it yet).
    slug: existing.status === 'published' ? existing.slug : derived.slug,
  });

  if (!article) return { ok: false, reason: 'not_found' };

  if (input.tags !== undefined) {
    setArticleTags(db, articleId, input.tags);
  }

  return { ok: true, article };
}

export type PublishFieldErrors = Partial<Record<'title' | 'body' | 'tags' | 'uploadIds', string>>;

export type PublishResult =
  | { ok: true; article: Article }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'forbidden' }
  | { ok: false; reason: 'validation'; errors: PublishFieldErrors };

/**
 * `POST /api/drafts/:id/publish`. All validation rules run before any
 * write; a validation failure returns every field error at once (a
 * field-keyed map), not just the first one hit.
 */
export function publishArticle(db: MyrioDatabase, articleId: string, authorId: string): PublishResult {
  const existing = getArticleById(db, articleId);
  if (!existing) return { ok: false, reason: 'not_found' };
  if (existing.authorId !== authorId) return { ok: false, reason: 'forbidden' };

  const errors: PublishFieldErrors = {};

  const title = existing.title.trim();
  if (title.length < 1 || title.length > TITLE_MAX_CHARS) {
    errors.title = `Title must be between 1 and ${TITLE_MAX_CHARS} characters.`;
  }

  const bodyJson = JSON.parse(existing.bodyJson);
  if (!hasNonEmptyBlock(bodyJson)) {
    errors.body = 'The article body must have at least one non-empty block.';
  }

  const tags = listTagsForArticle(db, articleId);
  if (tags.length < MIN_TAGS_TO_PUBLISH || tags.length > MAX_TAGS) {
    errors.tags = `Choose between ${MIN_TAGS_TO_PUBLISH} and ${MAX_TAGS} tags.`;
  }

  const uploadIds = collectReferencedUploadIds(bodyJson);
  const invalidUpload = uploadIds.some((uploadId) => {
    const upload = getUploadById(db, uploadId);
    return !upload || upload.ownerId !== authorId;
  });
  if (invalidUpload) {
    errors.uploadIds = 'One or more images are missing or not owned by you.';
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, reason: 'validation', errors };
  }

  // published_at is set on FIRST publish only and never changes again —
  // unpublish/republish must leave it byte-identical.
  const article = updateArticle(db, articleId, {
    status: 'published',
    publishedAt: existing.publishedAt ?? Date.now(),
  });
  if (!article) return { ok: false, reason: 'not_found' };

  return { ok: true, article };
}

export type UnpublishResult =
  | { ok: true; article: Article }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'forbidden' }
  | { ok: false; reason: 'not_published' };

/** `POST /api/articles/:id/unpublish` (SPEC-005: "Published --> Draft").
 * Leaves `slug` and `published_at` untouched so a later republish restores
 * exactly the same public URL. */
export function unpublishArticle(db: MyrioDatabase, articleId: string, authorId: string): UnpublishResult {
  const existing = getArticleById(db, articleId);
  if (!existing) return { ok: false, reason: 'not_found' };
  if (existing.authorId !== authorId) return { ok: false, reason: 'forbidden' };
  if (existing.status !== 'published') return { ok: false, reason: 'not_published' };

  const article = updateArticle(db, articleId, { status: 'draft' });
  if (!article) return { ok: false, reason: 'not_found' };

  return { ok: true, article };
}

export type GetDraftResult =
  | { ok: true; article: Article; tags: Tag[] }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'forbidden' };

/** Fetches a draft/article together with its tags, scoped to `authorId` —
 * used by the drafts GET route and by the editor's initial-load fetch. */
export function getDraftForAuthor(
  db: MyrioDatabase,
  articleId: string,
  authorId: string,
): GetDraftResult {
  const existing = getArticleById(db, articleId);
  if (!existing) return { ok: false, reason: 'not_found' };
  if (existing.authorId !== authorId) return { ok: false, reason: 'forbidden' };
  return { ok: true, article: existing, tags: listTagsForArticle(db, articleId) };
}
