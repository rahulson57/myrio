import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clapArticle,
  getMyClapCount,
  InvalidClapDeltaError,
  ArticleNotFoundError,
} from '../../src/server/services/claps';
import { getArticleById } from '../../src/server/db/repositories/articles';
import { createMigratedTestDb, makeArticle, makeUser, type TestDb } from './helpers';

describe('claps service (SPEC-007)', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('clapping 5 then 3 times yields myCount=8 and exactly one claps row', () => {
    const author = makeUser(testDb.db);
    const reader = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);

    const first = clapArticle(testDb.db, article.id, reader.id, 5);
    expect(first).toEqual({ myCount: 5, total: 5 });

    const second = clapArticle(testDb.db, article.id, reader.id, 3);
    expect(second).toEqual({ myCount: 8, total: 8 });

    const row = testDb.sqlite
      .prepare('SELECT COUNT(*) as n FROM claps WHERE article_id = ? AND user_id = ?')
      .get(article.id, reader.id) as { n: number };
    expect(row.n).toBe(1);
  });

  it('clamps a delta that would exceed 50 to 50, returns 200-shape success (not an error)', () => {
    const author = makeUser(testDb.db);
    const reader = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);

    clapArticle(testDb.db, article.id, reader.id, 45);
    const result = clapArticle(testDb.db, article.id, reader.id, 10);

    expect(result.myCount).toBe(50);
    expect(result.total).toBe(50);

    const row = testDb.sqlite
      .prepare('SELECT count FROM claps WHERE article_id = ? AND user_id = ?')
      .get(article.id, reader.id) as { count: number };
    expect(row.count).toBe(50);
  });

  it('rejects a delta outside 1-50 without writing a row', () => {
    const author = makeUser(testDb.db);
    const reader = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);

    expect(() => clapArticle(testDb.db, article.id, reader.id, 0)).toThrow(InvalidClapDeltaError);
    expect(() => clapArticle(testDb.db, article.id, reader.id, 51)).toThrow(InvalidClapDeltaError);
    expect(() => clapArticle(testDb.db, article.id, reader.id, 1.5)).toThrow(InvalidClapDeltaError);
    expect(() => clapArticle(testDb.db, article.id, reader.id, -3)).toThrow(InvalidClapDeltaError);

    const row = testDb.sqlite
      .prepare('SELECT COUNT(*) as n FROM claps WHERE article_id = ? AND user_id = ?')
      .get(article.id, reader.id) as { n: number };
    expect(row.n).toBe(0);
  });

  it('throws ArticleNotFoundError for a missing article', () => {
    const reader = makeUser(testDb.db);
    expect(() => clapArticle(testDb.db, 'does-not-exist', reader.id, 5)).toThrow(
      ArticleNotFoundError,
    );
  });

  it('allows self-clapping', () => {
    const author = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);

    const result = clapArticle(testDb.db, article.id, author.id, 10);
    expect(result).toEqual({ myCount: 10, total: 10 });
  });

  it('getMyClapCount returns 0 for a user who has not clapped', () => {
    const author = makeUser(testDb.db);
    const reader = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);

    expect(getMyClapCount(testDb.db, article.id, reader.id)).toBe(0);
  });

  it('articles.clap_total equals SUM(claps.count) after 200 randomized concurrent-shaped writes', () => {
    const author = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);
    const readers = Array.from({ length: 10 }, () => makeUser(testDb.db));

    // better-sqlite3 is synchronous, so "concurrent" writes from multiple
    // requests in this single-process app serialize through the same
    // connection — this drives 200 interleaved writes across 10 users'
    // rows (some pushing past the 50 cap) and asserts the invariant that
    // matters: clap_total tracks SUM(count) exactly, regardless of
    // interleaving or clamping.
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let i = 0; i < 200; i += 1) {
      const reader = readers[i % readers.length]!;
      const delta = 1 + Math.floor(rand() * 10);
      clapArticle(testDb.db, article.id, reader.id, delta);
    }

    const sumRow = testDb.sqlite
      .prepare('SELECT COALESCE(SUM(count), 0) as total FROM claps WHERE article_id = ?')
      .get(article.id) as { total: number };
    const updated = getArticleById(testDb.db, article.id);

    expect(updated?.clapTotal).toBe(sumRow.total);
  });
});
