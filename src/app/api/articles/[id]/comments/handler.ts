/**
 * GET/POST /api/articles/:id/comments (SPEC-007 "Comments"). GET is public
 * (reading comments needs no session); POST requires one. Both enrich the
 * service layer's id-only `Comment` rows with `authorHandle`/
 * `authorDisplayName` — `src/components/social/{CommentForm,CommentItem}`
 * render those fields directly rather than a bare `authorId`, and joining
 * here (not in the service, which stays free of user-table concerns) keeps
 * that a route-layer presentation decision.
 */

import { getDb, type MyrioDatabase } from '../../../../../server/db/client';
import { getUserById, type User } from '../../../../../server/db/repositories/users';
import type { Comment } from '../../../../../server/db/repositories/comments';
import { requireSameOrigin, requireUser, toErrorResponse } from '../../../../../server/auth/guard';
import {
  createComment,
  listTopLevelComments,
  ArticleNotFoundError,
  ParentNotFoundError,
  InvalidCommentBodyError,
  CommentDepthError,
  type TopLevelCommentDTO,
} from '../../../../../server/services/comments';

interface AuthorFields {
  authorHandle: string;
  authorDisplayName: string;
}

const UNKNOWN_AUTHOR: AuthorFields = { authorHandle: 'unknown', authorDisplayName: '[deleted]' };

function authorFields(db: MyrioDatabase, cache: Map<string, User | undefined>, authorId: string): AuthorFields {
  if (!cache.has(authorId)) {
    cache.set(authorId, getUserById(db, authorId));
  }
  const user = cache.get(authorId);
  return user ? { authorHandle: user.handle, authorDisplayName: user.displayName } : UNKNOWN_AUTHOR;
}

function enrichComment(db: MyrioDatabase, cache: Map<string, User | undefined>, comment: Comment) {
  return { ...comment, ...authorFields(db, cache, comment.authorId) };
}

function enrichTopLevel(db: MyrioDatabase, cache: Map<string, User | undefined>, dto: TopLevelCommentDTO) {
  return {
    ...dto,
    ...authorFields(db, cache, dto.authorId),
    previewReplies: dto.previewReplies.map((r) => enrichComment(db, cache, r)),
  };
}

export async function getComments(
  req: Request,
  articleId: string,
  db: MyrioDatabase = getDb(),
): Promise<Response> {
  try {
    const url = new URL(req.url);
    const cursor = url.searchParams.get('cursor');
    const page = listTopLevelComments(db, articleId, cursor);
    const cache = new Map<string, User | undefined>();
    return Response.json(
      { items: page.items.map((c) => enrichTopLevel(db, cache, c)), nextCursor: page.nextCursor },
      { status: 200 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}

interface CreateCommentBody {
  bodyText?: unknown;
  parentId?: unknown;
}

export async function postComment(
  req: Request,
  articleId: string,
  db: MyrioDatabase = getDb(),
): Promise<Response> {
  try {
    requireSameOrigin(req);
    const session = await requireUser(req, db);

    let body: CreateCommentBody;
    try {
      body = (await req.json()) as CreateCommentBody;
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const bodyText = typeof body.bodyText === 'string' ? body.bodyText : '';
    const parentId = typeof body.parentId === 'string' ? body.parentId : undefined;

    try {
      const comment = createComment(db, { articleId, authorId: session.userId, bodyText, parentId });
      const cache = new Map<string, User | undefined>();
      return Response.json(enrichComment(db, cache, comment), { status: 201 });
    } catch (err) {
      if (err instanceof InvalidCommentBodyError) {
        return Response.json({ error: err.message }, { status: 400 });
      }
      if (err instanceof ParentNotFoundError || err instanceof CommentDepthError) {
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
