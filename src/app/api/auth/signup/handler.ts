/**
 * POST /api/auth/signup (SPEC-004). Public — creates a `users` row and logs
 * the new account in immediately (session + cookie), matching the state
 * diagram's `Anonymous --> Authenticated: POST /api/auth/signup`.
 */

import { getDb, type MyrioDatabase } from '../../../../server/db/client';
import { createUser, getUserByEmail, getUserByHandle } from '../../../../server/db/repositories/users';
import { hashPassword } from '../../../../server/auth/hash';
import { createSessionForUser, serializeSessionCookie } from '../../../../server/auth/session';
import { requireSameOrigin, toErrorResponse } from '../../../../server/auth/guard';
import { rateLimit, RATE_LIMITS, getClientIp } from '../../../../server/auth/rate-limit';
import {
  validateEmail,
  validatePassword,
  validateHandle,
  validateDisplayName,
  validationErrorResponse,
  type FieldErrors,
} from '../_lib/validation';

interface SignupBody {
  email?: unknown;
  password?: unknown;
  handle?: unknown;
  displayName?: unknown;
}

export async function signup(req: Request, db: MyrioDatabase = getDb()): Promise<Response> {
  try {
    // CSRF (SPEC-004): first statement for every mutating endpoint, public
    // or not.
    requireSameOrigin(req);

    const ip = getClientIp(req);
    rateLimit(`signup:${ip}`, RATE_LIMITS.signup.limit, RATE_LIMITS.signup.windowMs);

    let body: SignupBody;
    try {
      body = (await req.json()) as SignupBody;
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const handle = typeof body.handle === 'string' ? body.handle.trim().toLowerCase() : '';
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';

    const fields: FieldErrors = {};
    const emailError = validateEmail(email);
    if (emailError) fields.email = emailError;
    const passwordError = validatePassword(password);
    if (passwordError) fields.password = passwordError;
    const handleError = validateHandle(handle);
    if (handleError) fields.handle = handleError;
    const displayNameError = validateDisplayName(displayName);
    if (displayNameError) fields.displayName = displayNameError;

    if (Object.keys(fields).length > 0) {
      return validationErrorResponse(fields);
    }

    if (getUserByEmail(db, email)) {
      return validationErrorResponse({ email: 'An account with this email already exists.' });
    }
    if (getUserByHandle(db, handle)) {
      return validationErrorResponse({ handle: 'This handle is already taken.' });
    }

    const passwordHash = await hashPassword(password);
    let user;
    try {
      user = createUser(db, { email, passwordHash, handle, displayName });
    } catch {
      // Rare race: another request took the email/handle between the check
      // above and this insert. The unique constraint is the source of
      // truth; the pre-check above is just the common-case fast path.
      return validationErrorResponse({ email: 'An account with this email or handle already exists.' });
    }
    const session = createSessionForUser(db, user.id);

    return Response.json(
      {
        user: { id: user.id, email: user.email, handle: user.handle, displayName: user.displayName },
      },
      {
        status: 201,
        headers: { 'Set-Cookie': serializeSessionCookie(session.id) },
      },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}

