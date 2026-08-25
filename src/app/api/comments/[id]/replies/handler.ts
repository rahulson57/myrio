/**
 * GET /api/comments/:id/replies (SPEC-007 "Comments"). Public — full reply
 * list for a top-level comment, cursor-paginated. Works whether or not the
 * parent itself was soft-deleted (replies stay attached).
 */

import { getDb, type MyrioDatabase } from '../../../../../server/db/client';
import { getUserById, type User } from '../../../../../server/db/repositories/users';
import { toErrorResponse } from '../../../../../server/auth/guard';
import { listReplies, CommentNotFoundError } from '../../../../../server/services/comments';

export async function getReplies(
  req: Request,
  commentId: string,
  db: MyrioDatabase = getDb(),
): Promise<Response> {
  try {
    const url = new URL(req.url);
    const cursor = url.searchParams.get('cursor');

    try {
      const page = listReplies(db, commentId, cursor);
      const cache = new Map<string, User | undefined>();
      const items = page.items.map((reply) => {
        if (!cache.has(reply.authorId)) {
          cache.set(reply.authorId, getUserById(db, reply.authorId));
        }
        const author = cache.get(reply.authorId);
        return {
          ...reply,
          authorHandle: author?.handle ?? 'unknown',
          authorDisplayName: author?.displayName ?? '[deleted]',
        };
      });
      return Response.json({ items, nextCursor: page.nextCursor }, { status: 200 });
    } catch (err) {
      if (err instanceof CommentNotFoundError) {
        return Response.json({ error: err.message }, { status: 404 });
      }
      throw err;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
