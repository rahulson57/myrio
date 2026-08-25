/**
 * POST/DELETE /api/users/:handle/follow (SPEC-007 "Follows"). Both
 * idempotent. `:handle` resolves to a target user id via the Data Layer;
 * the service layer (`follow`/`unfollow`) only ever deals in user ids.
 */

import { getDb, type MyrioDatabase } from '../../../../../server/db/client';
import { getUserByHandle } from '../../../../../server/db/repositories/users';
import { requireSameOrigin, requireUser, toErrorResponse } from '../../../../../server/auth/guard';
import { follow, unfollow, SelfFollowError } from '../../../../../server/services/follows';

function targetOrNotFound(db: MyrioDatabase, handle: string): { id: string } | Response {
  const user = getUserByHandle(db, handle);
  if (!user) {
    return Response.json({ error: 'User not found.' }, { status: 404 });
  }
  return user;
}

export async function postFollow(
  req: Request,
  handle: string,
  db: MyrioDatabase = getDb(),
): Promise<Response> {
  try {
    requireSameOrigin(req);
    const session = await requireUser(req, db);

    const target = targetOrNotFound(db, handle);
    if (target instanceof Response) return target;

    try {
      const result = follow(db, session.userId, target.id);
      return Response.json(result, { status: 200 });
    } catch (err) {
      if (err instanceof SelfFollowError) {
        return Response.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function deleteFollow(
  req: Request,
  handle: string,
  db: MyrioDatabase = getDb(),
): Promise<Response> {
  try {
    requireSameOrigin(req);
    const session = await requireUser(req, db);

    const target = targetOrNotFound(db, handle);
    if (target instanceof Response) return target;

    const result = unfollow(db, session.userId, target.id);
    return Response.json(result, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
