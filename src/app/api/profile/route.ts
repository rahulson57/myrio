import { patchProfile } from './handler';

export async function PATCH(req: Request): Promise<Response> {
  return patchProfile(req);
}
