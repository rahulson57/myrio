/**
 * POST /api/auth/forgot (SPEC-004 "Password reset (no email provider)").
 * Public. Always returns the same generic 200 body regardless of whether
 * the email is registered — SPEC-004 doesn't say this explicitly for
 * `forgot` the way it does for `login`, but leaking account existence
 * through this endpoint would defeat the point of the login endpoint's own
 * anti-enumeration behavior, so this mirrors it.
 */

import { getDb, type MyrioDatabase } from '../../../../server/db/client';
import { getUserByEmail } from '../../../../server/db/repositories/users';
import { createPasswordResetToken } from '../../../../server/db/repositories/password-reset-tokens';
import { requireSameOrigin, toErrorResponse } from '../../../../server/auth/guard';
import { rateLimit, RATE_LIMITS } from '../../../../server/auth/rate-limit';
import { generateResetToken, hashResetToken } from '../_lib/reset-token';

interface ForgotBody {
  email?: unknown;
}

const GENERIC_RESPONSE = { message: 'If that email is registered, a reset link was sent.' };

export async function forgot(req: Request, db: MyrioDatabase = getDb()): Promise<Response> {
  try {
    requireSameOrigin(req);

    let body: ForgotBody;
    try {
      body = (await req.json()) as ForgotBody;
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    // Rate limited per email (SPEC-004: "5 / hour per email"), even for an
    // email that turns out not to exist — otherwise this endpoint would leak
    // existence via rate-limit behavior alone.
    if (email) {
      rateLimit(`forgot:${email}`, RATE_LIMITS.forgot.limit, RATE_LIMITS.forgot.windowMs);
    }

    const user = email ? getUserByEmail(db, email) : undefined;
    if (user) {
      const rawToken = generateResetToken();
      createPasswordResetToken(db, user.id, hashResetToken(rawToken));
      // SPEC-004: "prints the reset URL to the server console" — the
      // documented dev-only delivery mechanism; there is no email provider.
      // eslint-disable-next-line no-console
      console.log(`[myrio] Password reset requested for ${user.email}: ` +
        `http://localhost:4310/reset-password?token=${rawToken}`);
    }

    return Response.json(GENERIC_RESPONSE, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export const POST = forgot;
