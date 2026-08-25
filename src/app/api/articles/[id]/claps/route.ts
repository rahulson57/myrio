/**
 * Next.js Route Handler entry point. Kept to a bare, correctly-typed
 * `POST(req, ctx)` wrapper — matches the pattern established by
 * `src/app/api/auth/**` (TASK-020): Next's route type validator rejects a
 * `route.ts` handler whose second parameter isn't a `RouteContext`, so the
 * actual db-injectable logic lives in `./handler.ts`, a plain module Next's
 * router ignores.
 *
 * DEC-043: this `[id]` folder is shared with TASK-023 (`unpublish/**`) and
 * TASK-026 (`route.ts` at this level, receiving a slug) — Social Graph owns
 * only `claps/**` and `comments/**` under it. Here, `params.id` really is
 * the article's id (SPEC-007's own URL: `POST /api/articles/:id/claps`).
 */
import type { NextRequest } from 'next/server';
import { postClap } from './handler';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  return postClap(req, id);
}
