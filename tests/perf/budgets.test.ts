import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

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
} as const;

const repoRoot = path.resolve(__dirname, '..', '..');
const seededDbPath = path.join(repoRoot, 'data', 'myrio.db');
const nextDir = path.join(repoRoot, '.next');
const appBuildManifestPath = path.join(nextDir, 'app-build-manifest.json');

interface AppBuildManifest {
  pages: Record<string, string[]>;
}

/**
 * The article route (`/@handle/:slug`) is owned by a later slice (S09 Feed &
 * Read) and doesn't exist yet — this bootstrap task (S01) only ever produces
 * `/layout`, `/error`, `/not-found` and `/_not-found/page` in the App Router
 * build manifest. Of the 7 routes SPEC-009 lists (`/`, `/@handle`,
 * `/@handle/:slug`, `/tag/:slug`, `/search`, `/new`, `/inbox`),
 * `/@handle/:slug` is the only one shaped as two consecutive dynamic
 * segments, so matching that shape (rather than hardcoding a guess at S09's
 * eventual folder/param names) finds it as soon as it lands and leaves every
 * other route alone.
 */
const ARTICLE_ROUTE_PAGE_KEY = /^\/\[[^/\]]+\]\/\[[^/\]]+\]\/page$/;

function findArticleRouteManifestEntry(): { chunkPaths: string[] } | null {
  if (!existsSync(appBuildManifestPath)) return null;
  const manifest = JSON.parse(readFileSync(appBuildManifestPath, 'utf8')) as AppBuildManifest;
  const key = Object.keys(manifest.pages ?? {}).find((candidate) =>
    ARTICLE_ROUTE_PAGE_KEY.test(candidate),
  );
  const chunks = key ? manifest.pages[key] : undefined;
  if (!chunks) return null;
  return { chunkPaths: chunks.filter((chunkPath) => chunkPath.endsWith('.js')) };
}

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

  const articleRoute = findArticleRouteManifestEntry();

  it.skipIf(!articleRoute)(
    '/@handle/:slug first-load JS stays under the client-bundle budget',
    () => {
      // Only runs once `next build` has produced a real app build manifest
      // containing the article route — that route belongs to Feed & Read
      // (S09), not this bootstrap task (S01). Until then this is skipped
      // (see findArticleRouteManifestEntry above) rather than asserting
      // against a route that doesn't exist. Once S09 lands the route, this
      // sums the gzipped size of every JS chunk the manifest lists for it
      // (shared chunks, e.g. the header, included — SPEC-009 counts those
      // against the budget) and checks it against the real budget.
      const totalGzipBytes = articleRoute!.chunkPaths.reduce((sum, chunkPath) => {
        const size = gzipSync(readFileSync(path.join(nextDir, chunkPath))).length;
        return sum + size;
      }, 0);
      expect(totalGzipBytes).toBeLessThanOrEqual(BUDGETS.articleFirstLoadJsMaxBytes);
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
});
