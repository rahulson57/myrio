/**
 * `POST /api/articles/:id/unpublish` (SPEC-005 "Publish state machine":
 * `Published --> Draft`). Leaves `slug`/`published_at` untouched so a
 * later republish restores exactly the same public URL.
 */
import { getDb, type MyrioDatabase } from '../../../../../server/db/client';
import { requireSameOrigin, requireUser, toErrorResponse } from '../../../../../server/auth/guard';
import { unpublishArticle } from '../../../../../server/services/articles';

export async function unpublishHandler(req: Request, id: string, db: MyrioDatabase = getDb()): Promise<Response> {
  try {
    requireSameOrigin(req);
    const session = await requireUser(req, db);

    const result = unpublishArticle(db, id, session.userId);

    if (!result.ok) {
      if (result.reason === 'not_found') return Response.json({ error: 'not_found' }, { status: 404 });
      if (result.reason === 'forbidden') return Response.json({ error: 'forbidden' }, { status: 403 });
      return Response.json({ error: 'not_published' }, { status: 409 });
    }

    return Response.json({ article: result.article });
  } catch (err) {
    return toErrorResponse(err);
  }
}
