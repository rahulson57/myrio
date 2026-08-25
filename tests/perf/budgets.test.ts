import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createTempDb } from '../setup/temp-db';
import { seedTestDb } from '../setup/seed-fixtures';

/**
 * Performance & size budgets (SPEC-001 "Governing Constraints — Runtime,
 * Ports, Test Command & Performance Budget"). These are ESTIMATEs: Apple
 * Silicon dev machine, SQLite WAL, single Node process, warm cache, measured
 * over RUNS runs against the seeded corpus, loopback only.
 *
 * This is the single source of truth for the numbers so later slices don't
 * redefine them. This bootstrap task (S01) only stands up the harness — it
 * does not implement the feed API, article API, article page, or seed data,
 * so most of these budgets have nothing real to measure yet. Per-budget
 * assertions below are written honestly: each either measures something
 * that genuinely exists on disk right now, or is `it.skip`/`it.skipIf`ed
 * with a comment naming the slice that unlocks it. Nothing here asserts
 * against a fake/stubbed endpoint just to look green.
 */
export const RUNS = 20;

export const BUDGETS = {
  /** `/api/feed`, page of 10. */
  feedApiP95Ms: 150,
  /** `/api/articles/:slug`. */
  articleApiP95Ms: 150,
  /** Article page full server render, TTFB -> HTML complete. */
  articleRenderP95Ms: 400,
  /** `PATCH /api/drafts/:id`. */
  editorAutosaveP95Ms: 120,
  /** 5 MB file. */
  imageUploadMs: 2000,
  /** `npm test` wall clock. */
  npmTestWallClockMs: 90_000,
  /** `./data/myrio.db` after `npm run db:seed`. */
  dbSeedMaxBytes: 100 * 1024 * 1024,
  /** First-load JS for `/@handle/:slug`, gzipped. */
  articleFirstLoadJsMaxBytes: 180 * 1024,
  /** `seedTestDb(dbPath)` (SPEC-003 "Test fixtures"), p95 over RUNS runs. */
  seedTestDbP95Ms: 300,
} as const;

const repoRoot = path.resolve(__dirname, '..', '..');
const seededDbPath = path.join(repoRoot, 'data', 'myrio.db');
const nextDir = path.join(repoRoot, '.next');
const appBuildManifestPath = path.join(nextDir, 'app-build-manifest.json');

/** Shape of `.next/app-build-manifest.json`: route key -> its JS/CSS chunk paths, relative to `.next/`. */
type AppBuildManifest = {
  pages?: Record<string, string[]>;
};

describe('performance & size budgets (SPEC-001)', () => {
  it('defines a positive budget for every measured surface', () => {
    for (const [name, value] of Object.entries(BUDGETS)) {
      expect(value, `${name} must be a positive number`).toBeGreaterThan(0);
    }
    expect(RUNS).toBeGreaterThan(0);
  });

  // Real check: this repo's own test command must respect its wall-clock
  // budget. Vitest reports this suite's own duration via hooks, not from
  // inside a test, so this is enforced by CI/task DoD timing `npm test`
  // itself (see SPEC-001 acceptance criteria) rather than asserted here.

  it.skipIf(!existsSync(seededDbPath))('./data/myrio.db stays under the seed-size budget', () => {
    // Only runs once `npm run db:seed` has produced a real db file — that
    // script and the corpus it seeds belong to the Data Layer / Seed Data
    // slice (S02), not this bootstrap task.
    const { size } = statSync(seededDbPath);
    expect(size).toBeLessThan(BUDGETS.dbSeedMaxBytes);
  });

  it.skipIf(!existsSync(appBuildManifestPath))(
    '/@handle/:slug first-load JS stays under the client-bundle budget',
    (ctx) => {
      // `next build` has produced a real app build manifest, but the
      // article route (`/@handle/:slug`) itself belongs to Feed & Read
      // (S09) — it may not exist in this build yet. Find its entry by
      // shape rather than a hardcoded folder name (that naming decision
      // isn't this task's to make): an app-router page manifest key ending
      // in "/page" whose dynamic segments include a "slug" param.
      const manifest = JSON.parse(readFileSync(appBuildManifestPath, 'utf8')) as AppBuildManifest;
      const pages = manifest.pages ?? {};
      const articleRouteKey = Object.keys(pages).find(
        (key) => key.endsWith('/page') && /\[.*slug.*\]/i.test(key),
      );

      if (!articleRouteKey) {
        ctx.skip(
          'no /@handle/:slug route in this build yet (Feed & Read, S09) — nothing to measure',
        );
      }

      const chunkFiles = [...new Set(pages[articleRouteKey!])].filter((file) =>
        file.endsWith('.js'),
      );
      expect(chunkFiles.length, `expected JS chunks for ${articleRouteKey}`).toBeGreaterThan(0);

      const totalGzippedBytes = chunkFiles.reduce((sum, relativePath) => {
        const contents = readFileSync(path.join(nextDir, relativePath));
        return sum + gzipSync(contents).length;
      }, 0);

      expect(
        totalGzippedBytes,
        `first-load JS for ${articleRouteKey} was ${(totalGzippedBytes / 1024).toFixed(1)} KB gzipped`,
      ).toBeLessThanOrEqual(BUDGETS.articleFirstLoadJsMaxBytes);
    },
  );

  it.skip('feed API responds within its p95 budget over the seeded corpus', () => {
    // Pending Feed & Read (S09): needs a running /api/feed and seeded corpus.
  });

  it.skip('article API responds within its p95 budget over the seeded corpus', () => {
    // Pending Feed & Read (S09): needs a running /api/articles/:slug and seeded corpus.
  });

  it.skip('article page server render stays within its p95 budget over the seeded corpus', () => {
    // Pending Feed & Read (S09): needs the article page route and seeded corpus.
  });

  it(
    'seedTestDb(dbPath) responds within its p95 budget over RUNS runs (Seed Data, S02)',
    async () => {
      const durationsMs: number[] = [];
      for (let i = 0; i < RUNS; i += 1) {
        const temp = await createTempDb();
        try {
          const start = performance.now();
          const seeded = seedTestDb(temp.path);
          durationsMs.push(performance.now() - start);
          expect(seeded.summary.users).toBe(3);
          expect(seeded.summary.articlesPublished).toBe(5);
          expect(seeded.summary.articlesDraft).toBe(1);
          seeded.close();
        } finally {
          await temp.cleanup();
        }
      }

      const sorted = [...durationsMs].sort((a, b) => a - b);
      const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
      const p95 = sorted[p95Index]!;
      expect(p95, `p95 over ${RUNS} runs was ${p95.toFixed(1)}ms`).toBeLessThan(BUDGETS.seedTestDbP95Ms);
    },
    30_000,
  );
});
