/**
 * GET /api/profile/drafts (SPEC-007 "Profile": "The owner also sees a
 * Drafts tab (private, 403 for anyone else)"). SPEC-007 names this endpoint
 * by path only, with no `:id`/`:handle` segment and no documented query
 * shape — the acceptance criterion ("GET /api/profile/drafts as a
 * non-owner returns 403") only makes sense if the request identifies WHICH
 * profile's drafts it's asking for, since a bare "my own drafts" self-fetch
 * has no non-owner case to reject.
 *
 * Judgment call (documented here rather than guessed silently, same spirit
 * as DEC-034/047): this handler takes the target profile as a `?handle=`
 * query param — the shape the `/@:handle` profile page's Drafts tab would
 * call with (RSC page reads the handle from its own route param, forwards
 * it here). Omitting `?handle` defaults to the requesting session's own
 * handle, so "fetch my drafts" still works with no query string. Either
 * way, only the matching session may read them; every other caller
 * (including anonymous) is rejected before any draft rows are read.
 */

import { getDb, type MyrioDatabase } from '../../../../server/db/client';
import { getUserByHandle } from '../../../../server/db/repositories/users';
import { listArticlesByAuthor } from '../../../../server/db/repositories/articles';
import { requireUser, toErrorResponse } from '../../../../server/auth/guard';

export async function getDrafts(req: Request, db: MyrioDatabase = getDb()): Promise<Response> {
  try {
    const session = await requireUser(req, db);

    const url = new URL(req.url);
    const requestedHandle = url.searchParams.get('handle');

    const target = requestedHandle ? getUserByHandle(db, requestedHandle) : { id: session.userId };
    if (!target) {
      return Response.json({ error: 'User not found.' }, { status: 404 });
    }
    if (target.id !== session.userId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const items = listArticlesByAuthor(db, target.id, 'draft');
    return Response.json({ items }, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
