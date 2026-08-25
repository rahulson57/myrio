/**
 * `POST /api/drafts/:id/publish` (SPEC-005 "Publish state machine" +
 * "Publish validation"). All validation rules run before any write;
 * failures come back as a single field-keyed error map (400).
 */
import { getDb, type MyrioDatabase } from '../../../../../server/db/client';
import { requireSameOrigin, requireUser, toErrorResponse } from '../../../../../server/auth/guard';
import { publishArticle } from '../../../../../server/services/articles';

export async function publishHandler(req: Request, id: string, db: MyrioDatabase = getDb()): Promise<Response> {
  try {
    requireSameOrigin(req);
    const session = await requireUser(req, db);

    const result = publishArticle(db, id, session.userId);

    if (!result.ok) {
      if (result.reason === 'not_found') return Response.json({ error: 'not_found' }, { status: 404 });
      if (result.reason === 'forbidden') return Response.json({ error: 'forbidden' }, { status: 403 });
      return Response.json({ error: result.errors }, { status: 400 });
    }

    return Response.json({ article: result.article });
  } catch (err) {
    return toErrorResponse(err);
  }
}
