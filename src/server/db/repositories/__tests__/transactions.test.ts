import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addClap } from '../claps';
import { createComment } from '../comments';
import { createArticle } from '../articles';
import { createUser } from '../users';
import { createMigratedTestDb, type TestDb } from './helpers';

/**
 * SPEC-002 acceptance: "A clap write and its `articles.clap_total` update,
 * and a comment write and its `articles.comment_count` update, each occur
 * in ONE transaction: a test that forces a mid-transaction throw leaves
 * both the child row and the counter unchanged."
 *
 * Both repository functions do their child-write + counter-update inside
 * `db.transaction()`, which better-sqlite3 backs with a native BEGIN/COMMIT
 * wrapper. To prove atomicity without touching production repository code,
 * each test installs a temporary SQLite trigger that raises an error the
 * instant the `articles` counter column is updated for a sentinel row —
 * forcing a genuine mid-transaction failure at exactly the second
 * statement — then asserts the whole transaction rolled back.
 */
describe('transaction atomicity (SPEC-002)', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('rolls back the clap row if the clap_total update fails mid-transaction', () => {
    const user = createUser(testDb.db, {
      email: 'clapper@example.com',
      passwordHash: 'x',
      handle: 'clapper',
      displayName: 'Clapper',
    });
    const author = createUser(testDb.db, {
      email: 'author@example.com',
      passwordHash: 'x',
      handle: 'author',
      displayName: 'Author',
    });
    const article = createArticle(testDb.db, {
      authorId: author.id,
      slug: 'clap-tx-test',
      title: 'Clap TX Test',
      bodyJson: '{}',
      bodyHtml: '<p>Body</p>',
      excerpt: 'Body',
      wordCount: 1,
      readTimeMinutes: 1,
      status: 'published',
      publishedAt: Date.now(),
    });

    testDb.sqlite.exec(`
      CREATE TRIGGER force_clap_total_failure
      BEFORE UPDATE OF clap_total ON articles
      WHEN NEW.id = '${article.id}'
      BEGIN
        SELECT RAISE(ABORT, 'forced failure for atomicity test');
      END;
    `);

    expect(() => addClap(testDb.db, article.id, user.id, 3)).toThrow(/forced failure/);

    const clapRow = testDb.sqlite
      .prepare('SELECT COUNT(*) AS n FROM claps WHERE article_id = ? AND user_id = ?')
      .get(article.id, user.id) as { n: number };
    expect(clapRow.n).toBe(0);

    const articleRow = testDb.sqlite
      .prepare('SELECT clap_total FROM articles WHERE id = ?')
      .get(article.id) as { clap_total: number };
    expect(articleRow.clap_total).toBe(0);
  });

  it('rolls back the comment row if the comment_count update fails mid-transaction', () => {
    const user = createUser(testDb.db, {
      email: 'commenter@example.com',
      passwordHash: 'x',
      handle: 'commenter',
      displayName: 'Commenter',
    });
    const article = createArticle(testDb.db, {
      authorId: user.id,
      slug: 'comment-tx-test',
      title: 'Comment TX Test',
      bodyJson: '{}',
      bodyHtml: '<p>Body</p>',
      excerpt: 'Body',
      wordCount: 1,
      readTimeMinutes: 1,
      status: 'published',
      publishedAt: Date.now(),
    });

    testDb.sqlite.exec(`
      CREATE TRIGGER force_comment_count_failure
      BEFORE UPDATE OF comment_count ON articles
      WHEN NEW.id = '${article.id}'
      BEGIN
        SELECT RAISE(ABORT, 'forced failure for atomicity test');
      END;
    `);

    expect(() =>
      createComment(testDb.db, {
        articleId: article.id,
        authorId: user.id,
        bodyText: 'This should not persist',
      }),
    ).toThrow(/forced failure/);

    const commentRow = testDb.sqlite
      .prepare('SELECT COUNT(*) AS n FROM comments WHERE article_id = ?')
      .get(article.id) as { n: number };
    expect(commentRow.n).toBe(0);

    const articleRow = testDb.sqlite
      .prepare('SELECT comment_count FROM articles WHERE id = ?')
      .get(article.id) as { comment_count: number };
    expect(articleRow.comment_count).toBe(0);
  });
});
