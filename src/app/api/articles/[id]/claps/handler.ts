/**
 * POST /api/articles/:id/claps (SPEC-007 "Claps"). Requires a session
 * (anonymous claps are rejected 401, per the acceptance criterion); the
 * per-user 50 cap and the one-transaction claps-row + `clap_total` update
 * are enforced below `clapArticle` (service) / the Data Layer + DB CHECK
 * constraint — this handler only translates HTTP <-> the service call.
 */

import { getDb, type MyrioDatabase } from '../../../../../server/db/client';
import { requireSameOrigin, requireUser, toErrorResponse } from '../../../../../server/auth/guard';
import {
  clapArticle,
  ArticleNotFoundError,
  InvalidClapDeltaError,
} from '../../../../../server/services/claps';

interface ClapBody {
  delta?: unknown;
}

export async function postClap(req: Request, articleId: string, db: MyrioDatabase = getDb()): Promise<Response> {
  try {
    requireSameOrigin(req);
    const session = await requireUser(req, db);

    let body: ClapBody;
    try {
      body = (await req.json()) as ClapBody;
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const delta = typeof body.delta === 'number' ? body.delta : NaN;

    try {
      const result = clapArticle(db, articleId, session.userId, delta);
      return Response.json(result, { status: 200 });
    } catch (err) {
      if (err instanceof InvalidClapDeltaError) {
        return Response.json({ error: err.message }, { status: 400 });
      }
      if (err instanceof ArticleNotFoundError) {
        return Response.json({ error: err.message }, { status: 404 });
      }
      throw err;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
