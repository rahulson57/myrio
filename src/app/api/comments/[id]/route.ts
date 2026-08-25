import type { NextRequest } from 'next/server';
import { deleteCommentHandler } from './handler';

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  return deleteCommentHandler(req, id);
}
