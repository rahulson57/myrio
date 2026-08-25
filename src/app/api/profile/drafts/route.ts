import { getDrafts } from './handler';

export async function GET(req: Request): Promise<Response> {
  return getDrafts(req);
}
