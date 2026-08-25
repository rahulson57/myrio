/**
 * `GET`/`PATCH /api/drafts/:id` (SPEC-005 "Autosave contract"). `id` is
 * passed explicitly (not read from a Next.js `RouteContext`) so tests can
 * drive it directly — `./route.ts` awaits the real `context.params` and
 * forwards it here.
 */
import { getDb, type MyrioDatabase } from '../../../../server/db/client';
import { requireSameOrigin, requireUser, toErrorResponse } from '../../../../server/auth/guard';
import { getDraftForAuthor, updateDraft } from '../../../../server/services/articles';

export async function getDraftHandler(req: Request, id: string, db: MyrioDatabase = getDb()): Promise<Response> {
  try {
    const session = await requireUser(req, db);
    const result = getDraftForAuthor(db, id, session.userId);

    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : 403;
      return Response.json({ error: result.reason }, { status });
    }

    return Response.json({ article: result.article, tags: result.tags.map((t) => t.displayName) });
  } catch (err) {
    return toErrorResponse(err);
  }
}

interface UpdateDraftBody {
  title?: unknown;
  subtitle?: unknown;
  bodyJson?: unknown;
  tags?: unknown;
  coverUploadId?: unknown;
  baseVersion?: unknown;
}

export async function updateDraftHandler(
  req: Request,
  id: string,
  db: MyrioDatabase = getDb(),
): Promise<Response> {
  try {
    requireSameOrigin(req);
    const session = await requireUser(req, db);

    let body: UpdateDraftBody;
    try {
      body = (await req.json()) as UpdateDraftBody;
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (typeof body.baseVersion !== 'number') {
      return Response.json({ error: 'baseVersion is required' }, { status: 400 });
    }

    const tags = Array.isArray(body.tags)
      ? body.tags.filter((t): t is string => typeof t === 'string')
      : undefined;
    if (tags && tags.length > 5) {
      return Response.json({ error: { tags: 'An article may have at most 5 tags.' } }, { status: 400 });
    }

    const result = updateDraft(db, id, session.userId, {
      title: typeof body.title === 'string' ? body.title : undefined,
      subtitle: typeof body.subtitle === 'string' ? body.subtitle : body.subtitle === null ? null : undefined,
      bodyJson: body.bodyJson,
      tags,
      coverUploadId:
        typeof body.coverUploadId === 'string' ? body.coverUploadId : body.coverUploadId === null ? null : undefined,
      baseVersion: body.baseVersion,
    });

    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : result.reason === 'forbidden' ? 403 : 409;
      return Response.json({ error: result.reason }, { status });
    }

    return Response.json({ article: result.article });
  } catch (err) {
    return toErrorResponse(err);
  }
}
