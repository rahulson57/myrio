/**
 * Shared test helpers for tests/social/routes/**. Mirrors
 * tests/auth/test-utils.ts's shape but is self-contained within this task's
 * file scope (tests/social/**) rather than importing across it, same
 * precedent as tests/social/helpers.ts.
 */

import { SESSION_COOKIE_NAME, createSessionForUser } from '../../../src/server/auth/session';
import type { MyrioDatabase } from '../../../src/server/db/client';
import { createMigratedTestDb, makeArticle, makeUser, type TestDb } from '../helpers';

export { createMigratedTestDb, makeArticle, makeUser, type TestDb };

export const VALID_ORIGIN = 'http://localhost:4310';

interface JsonRequestOptions {
  method?: string;
  body?: unknown;
  /** Omit for no Origin header; pass a string (including '') for one. */
  origin?: string;
  cookie?: string;
}

/** Builds a standard Web `Request`, matching what a Route Handler receives
 * from Next.js. */
export function jsonRequest(url: string, opts: JsonRequestOptions = {}): Request {
  const headers = new Headers();
  if (opts.body !== undefined) headers.set('Content-Type', 'application/json');
  if (opts.origin !== undefined) headers.set('Origin', opts.origin);
  if (opts.cookie !== undefined) headers.set('Cookie', opts.cookie);

  return new Request(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

/** Creates a real session row for `userId` and returns the `Cookie` header
 * value a request needs to authenticate as them. */
export function sessionCookieFor(db: MyrioDatabase, userId: string): string {
  const session = createSessionForUser(db, userId);
  return `${SESSION_COOKIE_NAME}=${session.id}`;
}
