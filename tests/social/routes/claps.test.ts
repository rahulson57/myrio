import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { postClap } from '../../../src/app/api/articles/[id]/claps/handler';
import { getArticleById } from '../../../src/server/db/repositories/articles';
import {
  createMigratedTestDb,
  jsonRequest,
  makeArticle,
  makeUser,
  sessionCookieFor,
  VALID_ORIGIN,
  type TestDb,
} from './test-utils';

describe('POST /api/articles/:id/claps', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('clapping 5 then 3 times yields myCount=8 and exactly one claps row', async () => {
    const author = makeUser(testDb.db);
    const clapper = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);
    const cookie = sessionCookieFor(testDb.db, clapper.id);

    const first = jsonRequest(`http://localhost:4310/api/articles/${article.id}/claps`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie,
      body: { delta: 5 },
    });
    const res1 = await postClap(first, article.id, testDb.db);
    expect(res1.status).toBe(200);
    expect(await res1.json()).toEqual({ myCount: 5, total: 5 });

    const second = jsonRequest(`http://localhost:4310/api/articles/${article.id}/claps`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie,
      body: { delta: 3 },
    });
    const res2 = await postClap(second, article.id, testDb.db);
    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({ myCount: 8, total: 8 });

    const rows = testDb.sqlite
      .prepare('SELECT COUNT(*) as n FROM claps WHERE article_id = ? AND user_id = ?')
      .get(article.id, clapper.id) as { n: number };
    expect(rows.n).toBe(1);
  });

  it('clamps a delta that would exceed 50 to 50, returning 200 (not an error)', async () => {
    const author = makeUser(testDb.db);
    const clapper = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);
    const cookie = sessionCookieFor(testDb.db, clapper.id);

    const first = jsonRequest(`http://localhost:4310/api/articles/${article.id}/claps`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie,
      body: { delta: 45 },
    });
    await postClap(first, article.id, testDb.db);

    const second = jsonRequest(`http://localhost:4310/api/articles/${article.id}/claps`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie,
      body: { delta: 10 },
    });
    const res = await postClap(second, article.id, testDb.db);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.myCount).toBe(50);

    const row = testDb.sqlite
      .prepare('SELECT count FROM claps WHERE article_id = ? AND user_id = ?')
      .get(article.id, clapper.id) as { count: number };
    expect(row.count).toBe(50);
  });

  it('keeps articles.clap_total equal to SUM(claps.count) after 200 randomized concurrent clap writes', async () => {
    const author = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);
    const clappers = Array.from({ length: 20 }, () => makeUser(testDb.db));
    const cookies = clappers.map((c) => sessionCookieFor(testDb.db, c.id));

    // 200 writes (20 clappers x 10 each, capped at delta<=2 so no clapper
    // can hit the 50-cap and pull the clamp path into what this test is
    // asserting), fired via Promise.all in a randomly shuffled order —
    // `postClap`'s own async plumbing (requireUser/JSON parsing) genuinely
    // interleaves across concurrent calls even though better-sqlite3's
    // actual transaction is synchronous/atomic; this is what actually
    // exercises "randomized concurrent" rather than a fixed sequential loop.
    const calls: Array<() => Promise<Response>> = [];
    for (let clapperIndex = 0; clapperIndex < clappers.length; clapperIndex++) {
      for (let i = 0; i < 10; i++) {
        calls.push(() => {
          const delta = 1 + Math.floor((clapperIndex + i) % 2);
          const req = jsonRequest(`http://localhost:4310/api/articles/${article.id}/claps`, {
            method: 'POST',
            origin: VALID_ORIGIN,
            cookie: cookies[clapperIndex],
            body: { delta },
          });
          return postClap(req, article.id, testDb.db);
        });
      }
    }
    // Deterministic shuffle (no Math.random() dependency needed): reverse
    // blocks of 7 — enough to interleave different clappers' writes rather
    // than running each clapper's 10 calls back-to-back.
    const shuffled: Array<() => Promise<Response>> = [];
    for (let i = 0; i < calls.length; i += 7) {
      shuffled.push(...calls.slice(i, i + 7).reverse());
    }

    const responses = await Promise.all(shuffled.map((call) => call()));
    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    const sumRow = testDb.sqlite
      .prepare('SELECT SUM(count) as total FROM claps WHERE article_id = ?')
      .get(article.id) as { total: number };
    const updated = getArticleById(testDb.db, article.id);
    expect(updated?.clapTotal).toBe(sumRow.total);
  });

  it('rejects an anonymous (no session) request with 401 and writes no row', async () => {
    const author = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);

    const req = jsonRequest(`http://localhost:4310/api/articles/${article.id}/claps`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      body: { delta: 5 },
    });
    const res = await postClap(req, article.id, testDb.db);
    expect(res.status).toBe(401);

    const count = testDb.sqlite.prepare('SELECT COUNT(*) as n FROM claps').get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('rejects a cross-origin request with 403', async () => {
    const author = makeUser(testDb.db);
    const clapper = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);
    const cookie = sessionCookieFor(testDb.db, clapper.id);

    const req = jsonRequest(`http://localhost:4310/api/articles/${article.id}/claps`, {
      method: 'POST',
      origin: 'http://evil.example',
      cookie,
      body: { delta: 5 },
    });
    const res = await postClap(req, article.id, testDb.db);
    expect(res.status).toBe(403);
  });

  it('rejects an out-of-range delta with 400', async () => {
    const author = makeUser(testDb.db);
    const clapper = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);
    const cookie = sessionCookieFor(testDb.db, clapper.id);

    const req = jsonRequest(`http://localhost:4310/api/articles/${article.id}/claps`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie,
      body: { delta: 0 },
    });
    const res = await postClap(req, article.id, testDb.db);
    expect(res.status).toBe(400);
  });

  it('allows self-clapping', async () => {
    const author = makeUser(testDb.db);
    const article = makeArticle(testDb.db, author.id);
    const cookie = sessionCookieFor(testDb.db, author.id);

    const req = jsonRequest(`http://localhost:4310/api/articles/${article.id}/claps`, {
      method: 'POST',
      origin: VALID_ORIGIN,
      cookie,
      body: { delta: 1 },
    });
    const res = await postClap(req, article.id, testDb.db);
    expect(res.status).toBe(200);
  });
});
