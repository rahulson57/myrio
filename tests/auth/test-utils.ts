/**
 * Shared test helpers for tests/auth/**. Reuses (read-only import, not a
 * modification) the Data Layer's own temp-db helper
 * (`src/server/db/repositories/__tests__/helpers.ts`) so every suite here
 * gets a fresh, migrated, per-suite SQLite file per SPEC-001 — never
 * `./data/myrio.db`.
 */

import { createUser, type User } from '../../src/server/db/repositories/users';
import { hashPassword } from '../../src/server/auth/hash';
import { createMigratedTestDb, type TestDb } from '../../src/server/db/repositories/__tests__/helpers';

export { createMigratedTestDb, type TestDb };

export const VALID_ORIGIN = 'http://localhost:4310';

interface JsonRequestOptions {
  method?: string;
  body?: unknown;
  /** Omit for no Origin header; pass a string (including '') for one. */
  origin?: string;
  cookie?: string;
}

/** Builds a standard Web `Request` with a JSON body, matching what a Route
 * Handler receives from Next.js — the handlers under test only ever read
 * `.headers`/`.json()`, so a plain `Request` (no Next-specific type) is
 * sufficient and keeps these tests decoupled from Next's server runtime. */
export function jsonRequest(url: string, opts: JsonRequestOptions = {}): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (opts.origin !== undefined) headers.set('Origin', opts.origin);
  if (opts.cookie !== undefined) headers.set('Cookie', opts.cookie);

  return new Request(url, {
    method: opts.method ?? 'POST',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

export interface TestUser {
  user: User;
  password: string;
}

/** Creates a user with a real argon2id hash for `password` (default a
 * policy-compliant one), for tests that need to log in as someone. */
export async function createTestUser(
  db: TestDb['db'],
  overrides: Partial<{ email: string; handle: string; displayName: string; password: string }> = {},
): Promise<TestUser> {
  const password = overrides.password ?? 'correct horse battery staple';
  const passwordHash = await hashPassword(password);
  const user = createUser(db, {
    email: overrides.email ?? 'user@example.com',
    passwordHash,
    handle: overrides.handle ?? 'testuser',
    displayName: overrides.displayName ?? 'Test User',
  });
  return { user, password };
}

/** Extracts the `myrio_session` cookie *value* (not the full Set-Cookie
 * string) from a Response, or null if absent. */
export function extractSessionCookieValue(res: Response): string | null {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  const match = setCookie.match(/myrio_session=([^;]*)/);
  const value = match?.[1];
  return value !== undefined ? decodeURIComponent(value) : null;
}
