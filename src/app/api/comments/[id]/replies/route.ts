import type { NextRequest } from 'next/server';
import { getReplies } from './handler';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  return getReplies(req, id);
}
