import { eq, inArray } from 'drizzle-orm';
import type { MyrioDatabase } from '../client';
import { articleTags, tags } from '../schema';

export type Tag = typeof tags.$inferSelect;

const MAX_TAGS_PER_ARTICLE = 5;

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

export interface CreateTagOverrides {
  /** Overrides the default `$defaultFn`-generated id (SPEC-003: the seed
   * pipeline supplies a deterministic UUIDv7 here; every other caller
   * omits this and gets today's random-id behaviour, unchanged). Only
   * applied when a new row is actually created — a get-or-create hit on an
   * existing tag ignores it. */
  id?: string;
  /** Overrides the default `Date.now()` stamp on `created_at` (SPEC-003
   * determinism). Omit for today's behaviour, unchanged. */
  createdAt?: number;
}

/** Get-or-create a tag by display name, in one transaction. `overrides` is
 * for the seed pipeline only — see `setArticleTags` below for why callers
 * must pre-create every tag through this function first if they need
 * deterministic ids. */
export function getOrCreateTag(
  db: MyrioDatabase,
  displayName: string,
  overrides?: CreateTagOverrides,
): Tag {
  const slug = slugify(displayName);

  return db.transaction((tx) => {
    const existing = tx.select().from(tags).where(eq(tags.slug, slug)).get();
    if (existing) {
      return existing;
    }
    return tx
      .insert(tags)
      .values({
        ...(overrides?.id !== undefined ? { id: overrides.id } : {}),
        slug,
        displayName: displayName.trim(),
        createdAt: overrides?.createdAt ?? Date.now(),
      })
      .returning()
      .get();
  });
}

/**
 * Replaces `articleId`'s tag set with `tagNames` (get-or-create each, then
 * swap the join rows), all in one transaction. Enforces the max-5-tags
 * policy (SPEC-002 "Tag policy").
 *
 * This function's own get-or-create branch has no override parameter, so a
 * caller that needs deterministic tag ids/timestamps (the seed pipeline)
 * must call `getOrCreateTag(db, name, overrides)` for every tag FIRST —
 * by the time this function runs, every name already resolves to an
 * existing row and this function's internal insert path never fires.
 */
export function setArticleTags(db: MyrioDatabase, articleId: string, tagNames: string[]): Tag[] {
  if (tagNames.length > MAX_TAGS_PER_ARTICLE) {
    throw new Error(`An article may have at most ${MAX_TAGS_PER_ARTICLE} tags.`);
  }

  return db.transaction((tx) => {
    const resolved: Tag[] = tagNames.map((name) => {
      const slug = slugify(name);
      const existing = tx.select().from(tags).where(eq(tags.slug, slug)).get();
      if (existing) return existing;
      return tx
        .insert(tags)
        .values({ slug, displayName: name.trim(), createdAt: Date.now() })
        .returning()
        .get();
    });

    tx.delete(articleTags).where(eq(articleTags.articleId, articleId)).run();

    for (const tag of resolved) {
      tx.insert(articleTags).values({ articleId, tagId: tag.id }).run();
    }

    return resolved;
  });
}

export function getTagBySlug(db: MyrioDatabase, slug: string): Tag | undefined {
  return db.select().from(tags).where(eq(tags.slug, slug)).get();
}

export function listTagsForArticle(db: MyrioDatabase, articleId: string): Tag[] {
  const rows = db
    .select({ tagId: articleTags.tagId })
    .from(articleTags)
    .where(eq(articleTags.articleId, articleId))
    .all();

  const ids = rows.map((r) => r.tagId);
  if (ids.length === 0) return [];

  return db.select().from(tags).where(inArray(tags.id, ids)).all();
}
