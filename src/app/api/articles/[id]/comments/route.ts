/**
 * Next.js Route Handler entry point (see claps/route.ts's header comment for
 * why this stays a bare wrapper around ./handler.ts). DEC-043: this `[id]`
 * folder is shared with TASK-023/TASK-026; Social Graph owns `comments/**`.
 */
import type { NextRequest } from 'next/server';
import { getComments, postComment } from './handler';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const { id } = await ctx.params;
  return getComments(req, id);
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const { id } = await ctx.params;
  return postComment(req, id);
}
