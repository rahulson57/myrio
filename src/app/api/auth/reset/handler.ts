/**
 * POST /api/auth/reset (SPEC-004 "Password reset (no email provider)").
 * Public (identity comes from the single-use token, not a session).
 * Consumes the token, rehashes the password, and — per SPEC-004's own
 * wording ("deletes all of that user's sessions") — deletes every session
 * for the user, not just other ones; there's no "current" session to spare
 * during an unauthenticated reset. Does not auto-login: the user re-enters
 * their new password on /login.
 */

import { getDb, type MyrioDatabase } from '../../../../server/db/client';
import { getPasswordResetTokenByHash, markPasswordResetTokenUsed } from '../../../../server/db/repositories/password-reset-tokens';
import { updateUserPassword } from '../../../../server/db/repositories/users';
import { hashPassword } from '../../../../server/auth/hash';
import { destroyAllSessionsForUser } from '../../../../server/auth/session';
import { requireSameOrigin, toErrorResponse } from '../../../../server/auth/guard';
import { validatePassword, validationErrorResponse } from '../_lib/validation';
import { hashResetToken } from '../_lib/reset-token';

interface ResetBody {
  token?: unknown;
  password?: unknown;
}

const INVALID_TOKEN_RESPONSE = { error: 'This reset link is invalid or has expired.' };

export async function reset(req: Request, db: MyrioDatabase = getDb()): Promise<Response> {
  try {
    requireSameOrigin(req);

    let body: ResetBody;
    try {
      body = (await req.json()) as ResetBody;
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const token = typeof body.token === 'string' ? body.token : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!token) {
      return Response.json(INVALID_TOKEN_RESPONSE, { status: 400 });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return validationErrorResponse({ password: passwordError });
    }

    const record = getPasswordResetTokenByHash(db, hashResetToken(token));
    const now = Date.now();
    if (!record || record.usedAt !== null || record.expiresAt <= now) {
      return Response.json(INVALID_TOKEN_RESPONSE, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    updateUserPassword(db, record.userId, passwordHash);
    markPasswordResetTokenUsed(db, record.id);
    destroyAllSessionsForUser(db, record.userId);

    return Response.json({ message: 'Password reset successful. Sign in with your new password.' }, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

