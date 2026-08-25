/**
 * POST /api/auth/logout (SPEC-004). Non-public — requires an active session
 * (SPEC-004: "Every non-public Route Handler calls requireUser as its first
 * statement"). Deletes the session row (real revocation, not just clearing
 * the cookie) and clears the cookie on the response either way.
 */

import { getDb, type MyrioDatabase } from '../../../../server/db/client';
import { destroySession, serializeExpiredSessionCookie } from '../../../../server/auth/session';
import { requireUser, requireSameOrigin, toErrorResponse } from '../../../../server/auth/guard';

export async function logout(req: Request, db: MyrioDatabase = getDb()): Promise<Response> {
  try {
    const session = await requireUser(req, db);
    requireSameOrigin(req);

    destroySession(db, session.sessionId);

    return Response.json(
      { message: 'Logged out.' },
      { status: 200, headers: { 'Set-Cookie': serializeExpiredSessionCookie() } },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}

