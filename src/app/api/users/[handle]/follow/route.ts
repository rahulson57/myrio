import type { NextRequest } from 'next/server';
import { deleteFollow, postFollow } from './handler';

type RouteContext = { params: Promise<{ handle: string }> };

export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const { handle } = await ctx.params;
  return postFollow(req, handle);
}

export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const { handle } = await ctx.params;
  return deleteFollow(req, handle);
}
