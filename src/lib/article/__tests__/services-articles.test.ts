import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createMigratedTestDb,
  type TestDb,
} from '../../../server/db/repositories/__tests__/helpers';
import { createUser } from '../../../server/db/repositories/users';
import { createUpload } from '../../../server/db/repositories/uploads';
import { getOrCreateTag } from '../../../server/db/repositories/tags';
import { articleTags } from '../../../server/db/schema';
import { getArticleById } from '../../../server/db/repositories/articles';
import {
  createDraft,
  getDraftForAuthor,
  publishArticle,
  unpublishArticle,
  updateDraft,
} from '../../../server/services/articles';

function doc(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

describe('articles service', () => {
  let testDb: TestDb;
  let authorId: string;
  let otherAuthorId: string;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
    authorId = createUser(testDb.db, {
      email: 'author@example.com',
      passwordHash: 'x',
      handle: 'author',
      displayName: 'Author',
    }).id;
    otherAuthorId = createUser(testDb.db, {
      email: 'other@example.com',
      passwordHash: 'x',
      handle: 'other',
      displayName: 'Other',
    }).id;
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe('createDraft', () => {
    it('creates a draft with derived fields computed from bodyJson', () => {
      const article = createDraft(testDb.db, {
        authorId,
        title: 'My Title',
        bodyJson: doc('Hello world.'),
      });
      expect(article.status).toBe('draft');
      expect(article.publishedAt).toBeNull();
      expect(article.wordCount).toBe(2);
      expect(article.bodyHtml).toBe('<p>Hello world.</p>');
      expect(article.slug).toMatch(/^my-title-/);
    });

    it('defaults to an empty title and empty body when omitted', () => {
      const article = createDraft(testDb.db, { authorId });
      expect(article.title).toBe('');
      expect(JSON.parse(article.bodyJson)).toEqual({
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      });
    });

    it('sanitizes bodyJson before storing it — dropped nodes never reach the DB', () => {
      const dirty = {
        type: 'doc',
        content: [{ type: 'script', content: [{ type: 'text', text: 'alert(1)' }] }],
      };
      const article = createDraft(testDb.db, { authorId, bodyJson: dirty });
      expect(article.bodyJson).not.toMatch(/script/);
    });

    it('sets tags when provided', () => {
      const article = createDraft(testDb.db, { authorId, tags: ['Tech', 'Life'] });
      const result = getDraftForAuthor(testDb.db, article.id, authorId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.tags.map((t) => t.displayName).sort()).toEqual(['Life', 'Tech']);
      }
    });
  });

  describe('updateDraft', () => {
    it('rejects a stale baseVersion with a conflict and touches nothing', () => {
      const article = createDraft(testDb.db, { authorId, title: 'Original' });
      const before = getArticleById(testDb.db, article.id)!;

      const result = updateDraft(testDb.db, article.id, authorId, {
        title: 'Changed',
        baseVersion: before.updatedAt - 1,
      });

      expect(result).toEqual({ ok: false, reason: 'conflict' });
      const after = getArticleById(testDb.db, article.id)!;
      expect(after.updatedAt).toBe(before.updatedAt);
      expect(after.bodyJson).toBe(before.bodyJson);
      expect(after.title).toBe('Original');
    });

    it('accepts a matching baseVersion and re-derives fields', () => {
      const article = createDraft(testDb.db, { authorId, title: 'Original' });

      const result = updateDraft(testDb.db, article.id, authorId, {
        title: 'Updated Title',
        bodyJson: doc('New content here.'),
        baseVersion: article.updatedAt,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.article.title).toBe('Updated Title');
        expect(result.article.bodyHtml).toBe('<p>New content here.</p>');
        expect(result.article.wordCount).toBe(3);
      }
    });

    it('returns forbidden for a non-owner', () => {
      const article = createDraft(testDb.db, { authorId });
      const result = updateDraft(testDb.db, article.id, otherAuthorId, {
        baseVersion: article.updatedAt,
      });
      expect(result).toEqual({ ok: false, reason: 'forbidden' });
    });

    it('returns not_found for a missing article', () => {
      const result = updateDraft(testDb.db, 'does-not-exist', authorId, { baseVersion: 0 });
      expect(result).toEqual({ ok: false, reason: 'not_found' });
    });

    it('does not overwrite slug once the article is published', () => {
      const article = createDraft(testDb.db, { authorId, title: 'Frozen Slug', bodyJson: doc('x') });
      setTagsAndPublish(testDb, article.id, authorId);
      const published = getArticleById(testDb.db, article.id)!;

      const result = updateDraft(testDb.db, article.id, authorId, {
        title: 'A Totally Different Title',
        baseVersion: published.updatedAt,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.article.slug).toBe(published.slug);
      }
    });
  });

  describe('publishArticle', () => {
    it('rejects publishing with 0 tags', () => {
      const article = createDraft(testDb.db, { authorId, title: 'T', bodyJson: doc('x') });
      const result = publishArticle(testDb.db, article.id, authorId);
      expect(result.ok).toBe(false);
      if (!result.ok && result.reason === 'validation') {
        expect(result.errors.tags).toBeTruthy();
      } else {
        throw new Error('expected validation failure');
      }
    });

    it('rejects publishing with 6 tags', () => {
      // setArticleTags (Data Layer, out of this module's scope) itself
      // refuses to store more than 5 — by design, no normal write path
      // through this service can ever reach 6 stored tags. publishArticle
      // must defend against that state independent of how it arose, so
      // this test creates it directly (bypassing setArticleTags) rather
      // than through updateDraft/createDraft.
      const article = createDraft(testDb.db, { authorId, title: 'T', bodyJson: doc('x') });
      for (const name of ['a', 'b', 'c', 'd', 'e', 'f']) {
        const tag = getOrCreateTag(testDb.db, name);
        testDb.db.insert(articleTags).values({ articleId: article.id, tagId: tag.id }).run();
      }

      const result = publishArticle(testDb.db, article.id, authorId);
      expect(result.ok).toBe(false);
      if (!result.ok && result.reason === 'validation') {
        expect(result.errors.tags).toBeTruthy();
      } else {
        throw new Error('expected validation failure');
      }
    });

    it('setArticleTags itself refuses to store more than 5 tags for one article', () => {
      const article = createDraft(testDb.db, { authorId, title: 'T', bodyJson: doc('x') });
      const result = updateDraft(testDb.db, article.id, authorId, {
        tags: ['a', 'b', 'c', 'd', 'e', 'f'],
        baseVersion: article.updatedAt,
      });
      expect(result.ok).toBe(false);
    });

    it('rejects publishing with an empty body', () => {
      const article = createDraft(testDb.db, { authorId, title: 'T', tags: ['a'] });
      const result = publishArticle(testDb.db, article.id, authorId);
      expect(result.ok).toBe(false);
      if (!result.ok && result.reason === 'validation') {
        expect(result.errors.body).toBeTruthy();
      } else {
        throw new Error('expected validation failure');
      }
    });

    it('rejects publishing with a blank title', () => {
      const article = createDraft(testDb.db, { authorId, title: '  ', bodyJson: doc('x'), tags: ['a'] });
      const result = publishArticle(testDb.db, article.id, authorId);
      expect(result.ok).toBe(false);
      if (!result.ok && result.reason === 'validation') {
        expect(result.errors.title).toBeTruthy();
      } else {
        throw new Error('expected validation failure');
      }
    });

    it('rejects publishing with an uploadId not owned by the author', () => {
      const stranger = createUpload(testDb.db, {
        ownerId: otherAuthorId,
        diskPath: '/uploads/stranger.webp',
        mime: 'image/webp',
        bytes: 100,
        kind: 'article_image',
      });
      const article = createDraft(testDb.db, {
        authorId,
        title: 'T',
        tags: ['a'],
        bodyJson: {
          type: 'doc',
          content: [{ type: 'image', attrs: { src: '/uploads/stranger.webp', uploadId: stranger.id } }],
        },
      });
      const result = publishArticle(testDb.db, article.id, authorId);
      expect(result.ok).toBe(false);
      if (!result.ok && result.reason === 'validation') {
        expect(result.errors.uploadIds).toBeTruthy();
      } else {
        throw new Error('expected validation failure');
      }
    });

    it('publishes with 1-5 valid tags, a title and a non-empty body', () => {
      const article = createDraft(testDb.db, { authorId, title: 'T', bodyJson: doc('x'), tags: ['a'] });
      const result = publishArticle(testDb.db, article.id, authorId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.article.status).toBe('published');
        expect(result.article.publishedAt).not.toBeNull();
      }
    });

    it('sets slug and published_at on first publish only; republish keeps them byte-identical', () => {
      const article = createDraft(testDb.db, { authorId, title: 'T', bodyJson: doc('x'), tags: ['a'] });
      const first = publishArticle(testDb.db, article.id, authorId);
      expect(first.ok).toBe(true);
      if (!first.ok) throw new Error('expected publish to succeed');
      const { slug: firstSlug, publishedAt: firstPublishedAt } = first.article;

      unpublishArticle(testDb.db, article.id, authorId);
      const second = publishArticle(testDb.db, article.id, authorId);
      expect(second.ok).toBe(true);
      if (!second.ok) throw new Error('expected republish to succeed');

      expect(second.article.slug).toBe(firstSlug);
      expect(second.article.publishedAt).toBe(firstPublishedAt);
    });

    it('returns forbidden for a non-owner', () => {
      const article = createDraft(testDb.db, { authorId, title: 'T', bodyJson: doc('x'), tags: ['a'] });
      const result = publishArticle(testDb.db, article.id, otherAuthorId);
      expect(result).toEqual({ ok: false, reason: 'forbidden' });
    });
  });

  describe('unpublishArticle', () => {
    it('moves a published article back to draft, leaving slug/published_at untouched', () => {
      const article = createDraft(testDb.db, { authorId, title: 'T', bodyJson: doc('x'), tags: ['a'] });
      const published = publishArticle(testDb.db, article.id, authorId);
      if (!published.ok) throw new Error('expected publish to succeed');

      const result = unpublishArticle(testDb.db, article.id, authorId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.article.status).toBe('draft');
        expect(result.article.slug).toBe(published.article.slug);
        expect(result.article.publishedAt).toBe(published.article.publishedAt);
      }
    });

    it('rejects unpublishing a draft that was never published', () => {
      const article = createDraft(testDb.db, { authorId });
      const result = unpublishArticle(testDb.db, article.id, authorId);
      expect(result).toEqual({ ok: false, reason: 'not_published' });
    });

    it('returns forbidden for a non-owner', () => {
      const article = createDraft(testDb.db, { authorId, title: 'T', bodyJson: doc('x'), tags: ['a'] });
      publishArticle(testDb.db, article.id, authorId);
      const result = unpublishArticle(testDb.db, article.id, otherAuthorId);
      expect(result).toEqual({ ok: false, reason: 'forbidden' });
    });
  });

  describe('getDraftForAuthor', () => {
    it('returns not_found for a missing id', () => {
      expect(getDraftForAuthor(testDb.db, 'nope', authorId)).toEqual({ ok: false, reason: 'not_found' });
    });

    it('returns forbidden for a non-owner', () => {
      const article = createDraft(testDb.db, { authorId });
      expect(getDraftForAuthor(testDb.db, article.id, otherAuthorId)).toEqual({
        ok: false,
        reason: 'forbidden',
      });
    });
  });
});

function setTagsAndPublish(testDb: TestDb, articleId: string, authorId: string): void {
  const result = updateDraft(testDb.db, articleId, authorId, {
    tags: ['a'],
    baseVersion: getArticleById(testDb.db, articleId)!.updatedAt,
  });
  if (!result.ok) throw new Error('setup: expected updateDraft to succeed');
  const published = publishArticle(testDb.db, articleId, authorId);
  if (!published.ok) throw new Error('setup: expected publish to succeed');
}
