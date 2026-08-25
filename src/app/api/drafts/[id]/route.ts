/**
 * Next.js Route Handler entry point — bare wrapper only (see
 * `src/app/api/auth/login/route.ts` for why). Real logic lives in
 * `./handler.ts`.
 */
import { getDraftHandler, updateDraftHandler } from './handler';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  return getDraftHandler(req, id);
}

export async function PATCH(req: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  return updateDraftHandler(req, id);
}
