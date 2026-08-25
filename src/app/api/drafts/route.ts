/**
 * Next.js Route Handler entry point — bare wrapper only (see the sibling
 * auth routes' `route.ts` files for why: Next's route type validator
 * rejects a non-`RouteContext` second parameter, which the db-injection
 * parameter tests need isn't). Real logic lives in `./handler.ts`.
 */
import { createDraftHandler } from './handler';

export async function POST(req: Request): Promise<Response> {
  return createDraftHandler(req);
}
