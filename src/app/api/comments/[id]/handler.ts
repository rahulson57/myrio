/**
 * DELETE /api/comments/:id (SPEC-007 "Comments"). Author or article author
 * only; soft delete. `deleteComment` (service) resolves both the comment
 * and its article internally via `getCommentById` (DEC-044 grant).
 */

import { getDb, type MyrioDatabase } from '../../../../server/db/client';
import { requireSameOrigin, requireUser, toErrorResponse } from '../../../../server/auth/guard';
import {
  deleteComment,
  CommentNotFoundError,
  ArticleNotFoundError,
  NotCommentAuthorError,
} from '../../../../server/services/comments';

export async function deleteCommentHandler(
  req: Request,
  commentId: string,
  db: MyrioDatabase = getDb(),
): Promise<Response> {
  try {
    requireSameOrigin(req);
    const session = await requireUser(req, db);

    try {
      const comment = deleteComment(db, commentId, session.userId);
      return Response.json(comment, { status: 200 });
    } catch (err) {
      if (err instanceof CommentNotFoundError || err instanceof ArticleNotFoundError) {
        return Response.json({ error: err.message }, { status: 404 });
      }
      if (err instanceof NotCommentAuthorError) {
        return Response.json({ error: err.message }, { status: 403 });
      }
      throw err;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
