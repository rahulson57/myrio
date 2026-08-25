/**
 * POST /api/auth/login (SPEC-004). Public. Wrong password and unknown email
 * MUST return byte-identical bodies + status (401) — see the shared
 * `INVALID_CREDENTIALS_RESPONSE_BODY` below and the dummy-hash timing note
 * on `getDummyHash`.
 */

import { getDb, type MyrioDatabase } from '../../../../server/db/client';
import { getUserByEmail } from '../../../../server/db/repositories/users';
import { hashPassword, verifyPassword } from '../../../../server/auth/hash';
import { createSessionForUser, serializeSessionCookie } from '../../../../server/auth/session';
import { requireSameOrigin, toErrorResponse } from '../../../../server/auth/guard';
import { rateLimit, RATE_LIMITS, getClientIp } from '../../../../server/auth/rate-limit';

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

const INVALID_CREDENTIALS_BODY = { error: 'Invalid email or password.' };

// A fixed, never-matching password hashed once and reused for every login
// attempt against an email that doesn't exist — so `verifyPassword` always
// does one real argon2id verification, keeping "wrong password" and
// "unknown email" in the same rough timing bucket (SPEC-004: "the response
// is identical (message + timing bucket) whether the email exists or
// not"). Computed lazily (not at module load) so importing this route for
// tests that never call it doesn't pay the argon2 cost.
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword('not-a-real-account-timing-placeholder');
  return dummyHashPromise;
}

export async function login(req: Request, db: MyrioDatabase = getDb()): Promise<Response> {
  try {
    requireSameOrigin(req);

    let body: LoginBody;
    try {
      body = (await req.json()) as LoginBody;
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const ip = getClientIp(req);

    // Rate limit before touching the DB so a flood of attempts against the
    // same email+IP is capped regardless of whether the account exists
    // (SPEC-004: "10 / 15 min per email+IP").
    rateLimit(`login:${email}:${ip}`, RATE_LIMITS.login.limit, RATE_LIMITS.login.windowMs);

    const user = email ? getUserByEmail(db, email) : undefined;
    const hashToVerify = user?.passwordHash ?? (await getDummyHash());
    const passwordValid = await verifyPassword(hashToVerify, password);

    if (!user || !passwordValid) {
      return Response.json(INVALID_CREDENTIALS_BODY, { status: 401 });
    }

    const session = createSessionForUser(db, user.id);

    return Response.json(
      {
        user: { id: user.id, email: user.email, handle: user.handle, displayName: user.displayName },
      },
      {
        status: 200,
        headers: { 'Set-Cookie': serializeSessionCookie(session.id) },
      },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}

