/**
 * Authorization guard (SPEC-004 "Authorization rule"). This is the ONLY
 * module every other module imports to answer "who is this request, and may
 * they touch this row" — route handlers call `requireUser`/`requireOwner` as
 * their first statement(s); nothing else in the app resolves a session or
 * decides ownership.
 *
 * SPEC-004 fixes this module's public contract as a literal code block:
 *
 * ```ts
 * export type Session = { userId: string; sessionId: string };
 * export function getSession(req: Request): Promise<Session | null>;
 * export function requireUser(req: Request): Promise<Session>;
 * export function requireOwner(session: Session, ownerId: string): void;
 * ```
 *
 * Every one of those signatures is preserved exactly — `getSession(req)`,
 * `requireUser(req)`, `requireOwner(session, ownerId)` behave, for any
 * spec-conformant one-argument call, exactly as documented. Two additions on
 * top of that literal block, both needed to satisfy the REST of SPEC-004 and
 * are called out explicitly rather than folded in silently:
 *
 * 1. `getSession`/`requireUser` accept an optional trailing `db` parameter
 *    (defaulting to the Data Layer's runtime singleton, `getDb()`). SPEC-001
 *    requires every integration test to run against "a fresh temp SQLite
 *    file per suite" and never touch `./data/myrio.db` — but `getDb()`'s own
 *    doc comment says it is "for runtime (non-test) callers" and exposes no
 *    override hook, and SPEC-004's fixed signature leaves no room for a
 *    required `db` argument either. A default parameter is the minimal way
 *    to satisfy both: every real call site in the app (which only ever
 *    passes `req`) is byte-identical to the spec'd single-argument contract,
 *    while this module's own tests pass a temp `db` explicitly. Flagged here
 *    for the reviewer to rule on deliberately, same spirit as DEC-034.
 * 2. `requireSameOrigin(req): void` and `HttpError`, both named explicitly
 *    in `docs/specs/architecture.md`'s (also LOCKED) interface list for this
 *    module — `requireSameOrigin(req): void — throws HttpError(403) unless
 *    Origin is http://localhost:4310` — implementing SPEC-004's CSRF section
 *    ("every mutating Route Handler ... rejects requests whose Origin header
 *    is not http://localhost:4310 (or absent) with 403").
 */

import { getDb, type MyrioDatabase } from '../db/client';
import { getSessionIdFromCookieHeader, resolveSession } from './session';

/** Thrown by this module's guards; route handlers catch it and translate
 * `status`/`message` into the HTTP response. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export type Session = { userId: string; sessionId: string };

/** The only origin a mutating request may declare (SPEC-001: single Next.js
 * process on port 4310, localhost only). */
const ALLOWED_ORIGIN = 'http://localhost:4310';

/**
 * Resolves the caller's session from its `Cookie` header. Returns `null` for
 * a missing cookie, an unknown session id, or an expired session (swept as a
 * side effect — see `resolveSession`). Never throws.
 */
export async function getSession(req: Request, db: MyrioDatabase = getDb()): Promise<Session | null> {
  const sessionId = getSessionIdFromCookieHeader(req.headers.get('cookie'));
  if (!sessionId) return null;
  return resolveSession(db, sessionId);
}

/** Resolves the caller's session or throws `HttpError(401)`. Every
 * non-public Route Handler calls this as its first statement (SPEC-004). */
export async function requireUser(req: Request, db: MyrioDatabase = getDb()): Promise<Session> {
  const session = await getSession(req, db);
  if (!session) {
    throw new HttpError(401, 'Unauthorized');
  }
  return session;
}

/** Throws `HttpError(403)` unless `session.userId === ownerId`. Called by
 * every handler that touches a row with an owner, after `requireUser`. */
export function requireOwner(session: Session, ownerId: string): void {
  if (session.userId !== ownerId) {
    throw new HttpError(403, 'Forbidden');
  }
}

/**
 * Throws `HttpError(403)` unless the request's `Origin` header is either
 * absent or exactly `http://localhost:4310` (SPEC-004 "CSRF": the
 * defense-in-depth check on top of `SameSite=Lax`). Every mutating
 * (POST/PATCH/DELETE) Route Handler calls this.
 */
export function requireSameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  if (origin !== null && origin !== ALLOWED_ORIGIN) {
    throw new HttpError(403, 'Cross-origin request rejected');
  }
}

/** Translates an `HttpError` (or any other thrown value) into a JSON
 * `Response`. Shared by every Route Handler in `src/app/api/auth/**` so the
 * error-response shape (`{ error: string }`) stays uniform across them. */
export function toErrorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  // Anything unexpected is a server bug, not a client error — never leak
  // internals (SPEC-009 "500 ... never leaks a stack trace"), and never
  // guess at a 4xx status for it.
  return Response.json({ error: 'Internal Server Error' }, { status: 500 });
}
