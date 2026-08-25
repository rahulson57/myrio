import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createArticle, listArticlesByTag, listFeed } from '../articles';
import { countUnreadNotifications } from '../notifications';
import { getOrCreateTag, setArticleTags } from '../tags';
import { createUser } from '../users';
import { createMigratedTestDb, type TestDb } from './helpers';

/**
 * SPEC-002 acceptance: "All 8 indexes in the index table exist;
 * `EXPLAIN QUERY PLAN` for the home-feed cursor query, the tag-feed query
 * and the notification-count query each report an index scan
 * (`USING INDEX idx_*`) and no `SCAN TABLE`."
 *
 * (The "all 8 indexes exist" half is covered by migrations.test.ts; this
 * file covers the query-plan half.)
 */
function explain(testDb: TestDb, sql: string, params: (string | number)[] = []): string {
  const rows = testDb.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as {
    detail: string;
  }[];
  return rows.map((r) => r.detail).join('\n');
}

describe('index usage (SPEC-002)', () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await createMigratedTestDb();

    const author = createUser(testDb.db, {
      email: 'author@example.com',
      passwordHash: 'x',
      handle: 'author',
      displayName: 'Author',
    });
    // Seed enough rows that the query planner's cost estimates reflect
    // realistic production shape (many articles, few carrying any given
    // tag) rather than the degenerate single-row case, where SQLite's
    // heuristics without ANALYZE statistics can pick an equally-valid but
    // differently-named join order.
    const engineering = getOrCreateTag(testDb.db, 'engineering');
    const design = getOrCreateTag(testDb.db, 'design');
    let taggedArticleId = '';
    for (let i = 0; i < 15; i += 1) {
      const article = createArticle(testDb.db, {
        authorId: author.id,
        slug: `index-test-article-${i}`,
        title: `Index Test Article ${i}`,
        bodyJson: '{}',
        bodyHtml: '<p>Body</p>',
        excerpt: 'Body',
        wordCount: 1,
        readTimeMinutes: 1,
        status: 'published',
        publishedAt: Date.now() - i,
      });
      if (i === 0) {
        taggedArticleId = article.id;
        setArticleTags(testDb.db, article.id, [engineering.displayName]);
      } else {
        setArticleTags(testDb.db, article.id, [design.displayName]);
      }
    }

    // Exercise the repository functions once so their query shapes are
    // proven to execute, not just plan-checked below.
    listFeed(testDb.db, 10);
    listArticlesByTag(testDb.db, engineering.id, 10);
    countUnreadNotifications(testDb.db, author.id);
    void taggedArticleId;

    // Give the query planner real cardinality statistics (sqlite_stat1) so
    // its join-order choice reflects production-shaped data — most articles
    // don't carry the 'engineering' tag — rather than the default
    // no-ANALYZE heuristics, which can pick an equally-valid but
    // differently-ordered plan on a nearly-empty database.
    testDb.sqlite.exec('ANALYZE');
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  it('home-feed cursor query uses idx_articles_feed, not a table scan', () => {
    const plan = explain(
      testDb,
      'SELECT * FROM articles WHERE status = ? ORDER BY published_at DESC, id DESC LIMIT 11',
      ['published'],
    );
    expect(plan).toMatch(/USING INDEX idx_articles_feed/);
    expect(plan).not.toMatch(/SCAN TABLE articles/);
  });

  it('tag-feed query uses idx_article_tags_tag, not a table scan', () => {
    const plan = explain(
      testDb,
      `SELECT articles.* FROM article_tags
       JOIN articles ON article_tags.article_id = articles.id
       WHERE article_tags.tag_id = ? AND articles.status = ?
       ORDER BY articles.published_at DESC, articles.id DESC LIMIT 11`,
      ['some-tag-id', 'published'],
    );
    expect(plan).toMatch(/USING (COVERING )?INDEX idx_article_tags_tag/);
    expect(plan).not.toMatch(/SCAN TABLE article_tags/);
  });

  it('notification-count query uses idx_notifications_user, not a table scan', () => {
    const plan = explain(
      testDb,
      'SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL',
      ['some-user-id'],
    );
    // A COVERING INDEX scan is a strictly better outcome than a plain index
    // scan here (the query is answered entirely from the index, no row
    // lookups at all) — both satisfy "index scan, not SCAN TABLE".
    expect(plan).toMatch(/USING (COVERING )?INDEX idx_notifications_user/);
    expect(plan).not.toMatch(/SCAN TABLE notifications/);
  });
});
