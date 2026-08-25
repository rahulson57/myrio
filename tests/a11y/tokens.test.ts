import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural checks on the design-token source and the "no raw colour /
 * hard px in components" rule (SPEC-009). These mirror two of the
 * acceptance gate's own repo-wide checks so a regression is caught locally
 * under `npm test`, not only at the (separate, machine-run) acceptance
 * gate.
 */

const tokensPath = join(process.cwd(), 'src/styles/tokens.css');
const tokensSrc = readFileSync(tokensPath, 'utf8');

const REQUIRED_TOKENS = [
  '--fs-body',
  '--fs-ui',
  '--fs-meta',
  '--fs-h1',
  '--fs-h2',
  '--fs-h3',
  '--measure',
  '--s-1',
  '--s-2',
  '--s-3',
  '--s-4',
  '--s-5',
  '--s-6',
  '--s-7',
  '--s-8',
  '--fg',
  '--fg-muted',
  '--bg',
  '--bg-subtle',
  '--accent',
  '--danger',
  '--border',
];

describe('src/styles/tokens.css', () => {
  it('defines every token SPEC-009 names, under :root', () => {
    const rootBlockMatch = tokensSrc.match(/:root\s*\{([\s\S]*?)\}/);
    expect(rootBlockMatch, ':root block must exist').not.toBeNull();
    const rootBlock = rootBlockMatch?.[1] ?? '';

    for (const token of REQUIRED_TOKENS) {
      expect(rootBlock.includes(`${token}:`), `${token} should be defined under :root`).toBe(true);
    }
  });

  it('fixes --accent to the spec-given Medium-ish green', () => {
    expect(tokensSrc).toMatch(/--accent:\s*#1a8917\s*;/);
  });

  it('sets --s-1 to 4px and --s-8 to 64px (the 4px-base scale endpoints)', () => {
    expect(tokensSrc).toMatch(/--s-1:\s*4px\s*;/);
    expect(tokensSrc).toMatch(/--s-8:\s*64px\s*;/);
  });

  it('disables transitions/animations under prefers-reduced-motion: reduce', () => {
    const reducedMotionBlock = tokensSrc.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
    expect(reducedMotionBlock, 'a prefers-reduced-motion: reduce block must exist').not.toBeNull();
    expect(reducedMotionBlock![1]).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(reducedMotionBlock![1]).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
  });
});

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('src/components/** colour discipline (SPEC-009)', () => {
  const componentsDir = join(process.cwd(), 'src/components');
  const files = walk(componentsDir);
  const hexPattern = /#[0-9a-fA-F]{3,8}\b/;

  it('found component files to check (sanity check the walk itself works)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('contains no raw hex colour literal anywhere under src/components/', () => {
    const offenders = files.filter((file) => hexPattern.test(readFileSync(file, 'utf8')));
    expect(offenders, `raw hex colour found in: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('src/components/** type-scale discipline (SPEC-009)', () => {
  // SPEC-009: "Components reference var(--...) only — a lint rule fails the
  // build on a raw hex literal or hard-coded px font-size inside
  // src/components/**." The ESLint no-restricted-syntax rule only matches
  // JS/TS AST Literal/TemplateElement nodes, so it never sees CSS Modules
  // (they aren't ESLint-parsed at all). This check closes that gap locally,
  // under `npm test`, mirroring the hex check above but for font-size.
  const componentsDir = join(process.cwd(), 'src/components');
  const cssFiles = walk(componentsDir).filter((file) => file.endsWith('.css'));
  // Matches a hard-coded numeric px value on a font-size declaration, e.g.
  // `font-size: 11px;` — but not `font-size: var(--fs-meta);`.
  const hardCodedFontSizePattern = /font-size\s*:\s*\d[\d.]*px\b/;

  it('found component stylesheets to check (sanity check the walk itself works)', () => {
    expect(cssFiles.length).toBeGreaterThan(0);
  });

  it('contains no hard-coded px font-size anywhere under src/components/ (must use a var(--fs-*) token)', () => {
    const offenders = cssFiles.filter((file) => hardCodedFontSizePattern.test(readFileSync(file, 'utf8')));
    expect(offenders, `hard-coded px font-size found in: ${offenders.join(', ')}`).toEqual([]);
  });
});
