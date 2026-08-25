import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SPEC-002: "`deriveArticleFields(bodyJson)` in `src/lib/article/derive.ts`
 * is the ONLY writer of slug/body_html/excerpt/word_count/
 * read_time_minutes ... a grep test fails if any file outside `derive.ts`
 * assigns those columns."
 *
 * `src/lib/article/derive.ts` itself belongs to a later slice (Article
 * Core) and is outside this module's file scope, so the full grep sweep
 * described in SPEC-002 isn't this test's job. What IS this module's job:
 * prove that `repositories/articles.ts` — the only place in this module
 * that writes the `articles` table — never computes these fields itself,
 * only ever assigns caller-supplied values straight through. If someone
 * later adds a `.split(...)`/`.replace(...)`/slugify-style computation
 * here instead of accepting it as an input, this test catches the
 * regression.
 */
describe('derived article fields boundary (SPEC-002)', () => {
  it('repositories/articles.ts only assigns derived fields from caller input, never computes them', () => {
    const source = readFileSync(path.join(__dirname, '..', 'articles.ts'), 'utf8');

    // Scope the scan to the createArticle/updateArticle function bodies —
    // the only places `articles` rows are written — so TypeScript interface
    // field declarations (which also contain e.g. `slug: string`) aren't
    // mistaken for value assignments.
    const functionBodies = [...source.matchAll(/export function (?:create|update)Article[\s\S]*?\n\}/g)]
      .map((m) => m[0])
      .join('\n');
    expect(functionBodies.length).toBeGreaterThan(0);

    for (const field of ['slug', 'bodyHtml', 'excerpt', 'wordCount', 'readTimeMinutes']) {
      const assignments = [...functionBodies.matchAll(new RegExp(`\\b${field}:\\s*([^,\\n]+)`, 'g'))];
      expect(assignments.length).toBeGreaterThan(0);
      for (const [, value] of assignments) {
        // Every assignment must be a direct pass-through of a caller-supplied
        // value (`input.<field>`), optional-chained or defaulted — never a
        // computed expression (string methods, arithmetic, etc.).
        expect(value!.trim()).toMatch(/^input\.\w+/);
      }
    }
  });
});
