/**
 * PATCH /api/profile (SPEC-007 "Profile"). Updates the requesting user's own
 * profile — there is no `:id`/`:handle` in the URL by design, this always
 * targets `session.userId`. Avatar/cover are referenced by `uploadId`
 * (Media & Uploads' `POST /api/uploads` contract, SPEC-011, a sibling slice
 * out of this task's scope) — this handler accepts whatever id the client
 * sends and does not itself validate the upload exists/belongs to the user;
 * `users.avatar_upload_id`/`cover_upload_id`'s FK to `uploads.id` is the
 * backstop for a bogus id.
 */

import { getDb, type MyrioDatabase } from '../../../server/db/client';
import { requireSameOrigin, requireUser, toErrorResponse } from '../../../server/auth/guard';
import {
  updateProfile,
  ProfileValidationError,
  HandleRateLimitedError,
  HandleTakenError,
  UserNotFoundError,
  type UpdateProfileInput,
} from '../../../server/services/profiles';
import { getHandleChangeTracker } from './_lib/tracker';

interface PatchProfileBody {
  displayName?: unknown;
  bio?: unknown;
  handle?: unknown;
  socialTwitter?: unknown;
  socialGithub?: unknown;
  socialWebsite?: unknown;
  avatarUploadId?: unknown;
  coverUploadId?: unknown;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function strOrNull(v: unknown): string | null | undefined {
  if (v === null) return null;
  return typeof v === 'string' ? v : undefined;
}

export async function patchProfile(req: Request, db: MyrioDatabase = getDb()): Promise<Response> {
  try {
    requireSameOrigin(req);
    const session = await requireUser(req, db);

    let body: PatchProfileBody;
    try {
      body = (await req.json()) as PatchProfileBody;
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const input: UpdateProfileInput = {
      displayName: str(body.displayName),
      bio: strOrNull(body.bio),
      handle: str(body.handle),
      socialTwitter: strOrNull(body.socialTwitter),
      socialGithub: strOrNull(body.socialGithub),
      socialWebsite: strOrNull(body.socialWebsite),
      avatarUploadId: strOrNull(body.avatarUploadId),
      coverUploadId: strOrNull(body.coverUploadId),
    };

    try {
      const updated = updateProfile(db, session.userId, input, { tracker: getHandleChangeTracker() });
      // Never return passwordHash — this endpoint is a profile update, not
      // an auth endpoint, and the client bundle has no reason to see it.
      return Response.json(
        {
          id: updated.id,
          email: updated.email,
          handle: updated.handle,
          displayName: updated.displayName,
          bio: updated.bio,
          avatarUploadId: updated.avatarUploadId,
          coverUploadId: updated.coverUploadId,
          socialTwitter: updated.socialTwitter,
          socialGithub: updated.socialGithub,
          socialWebsite: updated.socialWebsite,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
        { status: 200 },
      );
    } catch (err) {
      if (err instanceof ProfileValidationError) {
        return Response.json({ error: 'Validation failed', fields: err.fieldErrors }, { status: 400 });
      }
      if (err instanceof HandleRateLimitedError) {
        return Response.json({ error: err.message }, { status: 429 });
      }
      if (err instanceof HandleTakenError) {
        return Response.json(
          { error: 'Validation failed', fields: { handle: err.message } },
          { status: 400 },
        );
      }
      if (err instanceof UserNotFoundError) {
        return Response.json({ error: err.message }, { status: 404 });
      }
      throw err;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
