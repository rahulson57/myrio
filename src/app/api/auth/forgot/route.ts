/**
 * Next.js Route Handler entry point. Kept to a bare, correctly-typed
 * `POST(req: Request)` wrapper — Next's route type validator (`next build`,
 * `.next/types/validator.ts`) rejects both (a) any named export from a
 * `route.ts` file other than a recognized route field, and (b) a second
 * handler parameter that isn't a `RouteContext`. The actual db-injectable
 * handler (used directly by tests, which need to pass an isolated test db)
 * lives in `./handler.ts`, a plain module Next's router ignores.
 */
import { forgot } from './handler';

export async function POST(req: Request): Promise<Response> {
  return forgot(req);
}
