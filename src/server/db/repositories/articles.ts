import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { MyrioDatabase } from '../client';
import { articleTags, articles } from '../schema';

export type Article = typeof articles.$inferSelect;

/**
 * Fields this module accepts but never computes. `slug`, `bodyHtml`,
 * `excerpt`, `wordCount` and `readTimeMinutes` are DERIVED columns whose
 * only writer is `deriveArticleFields(bodyJson)` in
 * `src/lib/article/derive.ts` (a later slice, outside this module's file
 * scope). Callers here must derive them first and pass the results in —
 * this repository only ever assigns what it is given.
 */
export interface DerivedArticleFields {
  slug: string;
  bodyHtml: string;
  excerpt: string;
  wordCount: number;
  readTimeMinutes: number;
}

export interface CreateArticleInput extends DerivedArticleFields {
  authorId: string;
  title: string;
  subtitle?: string | null;
  bodyJson: string;
  coverUploadId?: string | null;
  status: 'draft' | 'published';
  publishedAt?: number | null;
}

export function createArticle(db: MyrioDatabase, input: CreateArticleInput): Article {
  const now = Date.now();
  return db
    .insert(articles)
    .values({
      authorId: input.authorId,
      slug: input.slug,
      title: input.title,
      subtitle: input.subtitle ?? null,
      bodyJson: input.bodyJson,
      bodyHtml: input.bodyHtml,
      excerpt: input.excerpt,
      wordCount: input.wordCount,
      readTimeMinutes: input.readTimeMinutes,
      coverUploadId: input.coverUploadId ?? null,
      status: input.status,
      publishedAt: input.publishedAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

export interface UpdateArticleInput extends Partial<DerivedArticleFields> {
  title?: string;
  subtitle?: string | null;
  bodyJson?: string;
  coverUploadId?: string | null;
  status?: 'draft' | 'published';
  publishedAt?: number | null;
}

export function updateArticle(
  db: MyrioDatabase,
  id: string,
  input: UpdateArticleInput,
): Article | undefined {
  return db
    .update(articles)
    .set({ ...input, updatedAt: Date.now() })
    .where(eq(articles.id, id))
    .returning()
    .get();
}

export function getArticleBySlug(db: MyrioDatabase, slug: string): Article | undefined {
  return db.select().from(articles).where(eq(articles.slug, slug)).get();
}

export function getArticleById(db: MyrioDatabase, id: string): Article | undefined {
  return db.select().from(articles).where(eq(articles.id, id)).get();
}

export interface FeedCursor {
  publishedAt: number;
  id: string;
}

export interface FeedPage {
  items: Article[];
  nextCursor: FeedCursor | null;
}

/**
 * Home feed: published articles newest-first, keyset-paginated. Served by
 * `idx_articles_feed (status, published_at DESC, id DESC)` — the `id`
 * tiebreak makes the cursor stable when two articles share a
 * `published_at` millisecond.
 */
export function listFeed(db: MyrioDatabase, limit: number, after?: FeedCursor): FeedPage {
  const cursorCondition = after
    ? or(
        lt(articles.publishedAt, after.publishedAt),
        and(eq(articles.publishedAt, after.publishedAt), lt(articles.id, after.id)),
      )
    : undefined;

  const where = cursorCondition
    ? and(eq(articles.status, 'published'), cursorCondition)
    : eq(articles.status, 'published');

  const items = db
    .select()
    .from(articles)
    .where(where)
    .orderBy(desc(articles.publishedAt), desc(articles.id))
    .limit(limit + 1)
    .all();

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const last = page.at(-1);

  return {
    items: page,
    nextCursor:
      hasMore && last && last.publishedAt !== null
        ? { publishedAt: last.publishedAt, id: last.id }
        : null,
  };
}

/**
 * Tag feed: published articles carrying `tagId`, newest-first,
 * keyset-paginated. Served by `idx_article_tags_tag (tag_id, article_id)`
 * joined into `idx_articles_feed` for ordering.
 */
export function listArticlesByTag(
  db: MyrioDatabase,
  tagId: string,
  limit: number,
  after?: FeedCursor,
): FeedPage {
  const cursorCondition = after
    ? or(
        lt(articles.publishedAt, after.publishedAt),
        and(eq(articles.publishedAt, after.publishedAt), lt(articles.id, after.id)),
      )
    : undefined;

  const where = cursorCondition
    ? and(eq(articleTags.tagId, tagId), eq(articles.status, 'published'), cursorCondition)
    : and(eq(articleTags.tagId, tagId), eq(articles.status, 'published'));

  const items = db
    .select({ articles })
    .from(articleTags)
    .innerJoin(articles, eq(articleTags.articleId, articles.id))
    .where(where)
    .orderBy(desc(articles.publishedAt), desc(articles.id))
    .limit(limit + 1)
    .all()
    .map((row) => row.articles);

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const last = page.at(-1);

  return {
    items: page,
    nextCursor:
      hasMore && last && last.publishedAt !== null
        ? { publishedAt: last.publishedAt, id: last.id }
        : null,
  };
}

export function listArticlesByAuthor(
  db: MyrioDatabase,
  authorId: string,
  status?: 'draft' | 'published',
): Article[] {
  const where = status
    ? and(eq(articles.authorId, authorId), eq(articles.status, status))
    : eq(articles.authorId, authorId);

  return db
    .select()
    .from(articles)
    .where(where)
    .orderBy(desc(articles.publishedAt))
    .all();
}
