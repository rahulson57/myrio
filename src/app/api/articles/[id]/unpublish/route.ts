/**
 * Next.js Route Handler entry point — bare wrapper only (see
 * `src/app/api/auth/login/route.ts` for why). Real logic lives in
 * `./handler.ts`.
 */
import { unpublishHandler } from './handler';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  return unpublishHandler(req, id);
}
