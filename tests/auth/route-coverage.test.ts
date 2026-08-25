/**
 * SPEC-004 acceptance criterion: "A route-coverage test enumerates every
 * file under src/app/api/** and fails if any POST/PATCH/DELETE handler does
 * not call requireUser."
 *
 * Read literally that would also fail on this task's own signup/login/
 * forgot/reset handlers — but SPEC-004's body text states the actual rule
 * one paragraph above the acceptance list: "Every **non-public** Route
 * Handler calls requireUser as its first statement." Those four ARE the
 * app's public, pre-session endpoints by design (they're how a session gets
 * created or a password gets reset in the first place) — a handler that
 * required an existing session to create one would be unreachable. This
 * test implements the "non-public" reading, via an explicit, named
 * allowlist rather than a silent blanket exemption, so a reviewer can see
 * and challenge exactly which routes are claimed public. Flagged in the
 * proposal for deliberate sign-off, same spirit as DEC-034's sliding-
 * renewal call.
 *
 * Written to scan all of `src/app/api/**`, not just `src/app/api/auth/**`,
 * so it keeps doing its job as later slices (drafts, comments, uploads, …)
 * add their own mutating routes.
 *
 * `route.ts` files here are thin wrappers, not the whole handler: Next's
 * route type validator (`next build` / `.next/types/validator.ts`) rejects
 * a `route.ts` that exports anything other than a recognized route field
 * (GET/POST/etc. + config), and separately rejects a handler whose second
 * parameter isn't a `RouteContext` — which a db-injection parameter (used
 * so tests can pass an isolated test db instead of the real singleton)
 * isn't. So the actual `requireUser`-calling logic lives in a sibling
 * `handler.ts` that `route.ts` imports and calls; this scan follows that
 * import so it still sees the real check rather than just the wrapper.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const API_ROOT = path.join(process.cwd(), 'src/app/api');

const PUBLIC_ROUTES = new Set([
  'src/app/api/auth/signup/route.ts',
  'src/app/api/auth/login/route.ts',
  'src/app/api/auth/forgot/route.ts',
  'src/app/api/auth/reset/route.ts',
]);

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...findRouteFiles(full));
    } else if (entry === 'route.ts' || entry === 'route.tsx') {
      out.push(full);
    }
  }
  return out;
}

const MUTATING_EXPORT_RE = /export\s+(const|async function)\s+(POST|PATCH|DELETE)\b/;
const MUTATING_REEXPORT_RE = /export\s*\{\s*[^}]*\bas\s+(POST|PATCH|DELETE)\b[^}]*\}/;

/** `route.ts`'s own source, plus a sibling `handler.ts`'s source if one exists (see file header). */
function readRouteSource(file: string): string {
  const own = readFileSync(file, 'utf-8');
  const handlerPath = path.join(path.dirname(file), 'handler.ts');
  return existsSync(handlerPath) ? `${own}\n${readFileSync(handlerPath, 'utf-8')}` : own;
}

describe('route coverage: every mutating handler calls requireUser (or is explicitly public)', () => {
  const routeFiles = findRouteFiles(API_ROOT);

  it('found at least one route.ts file to check (sanity check for this test)', () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  for (const file of routeFiles) {
    const relative = path.relative(process.cwd(), file).split(path.sep).join('/');
    const source = readRouteSource(file);
    const isMutating = MUTATING_EXPORT_RE.test(source) || MUTATING_REEXPORT_RE.test(source);

    if (!isMutating) continue;

    it(`${relative}`, () => {
      const callsRequireUser = /requireUser\s*\(/.test(source);
      const isDeclaredPublic = PUBLIC_ROUTES.has(relative);

      if (!callsRequireUser && !isDeclaredPublic) {
        throw new Error(
          `${relative} exports a mutating handler but never calls requireUser(), and is not in the ` +
            `PUBLIC_ROUTES allowlist in tests/auth/route-coverage.test.ts. Either call requireUser as ` +
            `the handler's first statement, or add it to PUBLIC_ROUTES with a comment explaining why it ` +
            `must be reachable without a session.`,
        );
      }
      expect(callsRequireUser || isDeclaredPublic).toBe(true);
    });
  }

  it('every PUBLIC_ROUTES entry still exists on disk (no stale allowlist entries)', () => {
    for (const relative of PUBLIC_ROUTES) {
      const full = path.join(process.cwd(), relative);
      expect(() => statSync(full), `${relative} is in PUBLIC_ROUTES but no longer exists`).not.toThrow();
    }
  });
});
