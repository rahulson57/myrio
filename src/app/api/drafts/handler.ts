/**
 * POST /api/drafts (SPEC-005 "Publish state machine": `[*] --> Draft`).
 * Creates a new, empty (or seeded) draft owned by the caller. Every field
 * is optional — the editor calls this once on "Write" to get an `id` and
 * `baseVersion` to start autosaving against.
 */
import { getDb, type MyrioDatabase } from '../../../server/db/client';
import { requireSameOrigin, requireUser, toErrorResponse } from '../../../server/auth/guard';
import { createDraft } from '../../../server/services/articles';

interface CreateDraftBody {
  title?: unknown;
  subtitle?: unknown;
  bodyJson?: unknown;
  tags?: unknown;
  coverUploadId?: unknown;
}

export async function createDraftHandler(req: Request, db: MyrioDatabase = getDb()): Promise<Response> {
  try {
    requireSameOrigin(req);
    const session = await requireUser(req, db);

    let body: CreateDraftBody = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text) as CreateDraftBody;
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const tags = Array.isArray(body.tags)
      ? body.tags.filter((t): t is string => typeof t === 'string')
      : undefined;
    if (tags && tags.length > 5) {
      return Response.json({ error: { tags: 'An article may have at most 5 tags.' } }, { status: 400 });
    }

    const article = createDraft(db, {
      authorId: session.userId,
      title: typeof body.title === 'string' ? body.title : undefined,
      subtitle: typeof body.subtitle === 'string' ? body.subtitle : undefined,
      bodyJson: body.bodyJson,
      tags,
      coverUploadId: typeof body.coverUploadId === 'string' ? body.coverUploadId : undefined,
    });

    return Response.json({ article }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
