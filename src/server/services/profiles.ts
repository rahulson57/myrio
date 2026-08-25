import {
  getUserById,
  getUserByHandle,
  updateUserProfile as repoUpdateUserProfile,
  type User,
} from '../db/repositories/users';
import type { MyrioDatabase } from '../db/client';

/**
 * Profiles service (SPEC-007 "Profile"). Validates `PATCH /api/profile`
 * inputs and orchestrates the update, including the handle-change path
 * (DEC-047 widened `UpdateUserProfileInput` with a `handle` field, an
 * existing column that just wasn't exposed on update before).
 */

export const BIO_MAX_LENGTH = 160;
export const DISPLAY_NAME_MIN_LENGTH = 1;
export const DISPLAY_NAME_MAX_LENGTH = 60;
// Mirrors the `^[a-z0-9_]{3,30}$` convention documented on `users.handle`
// in SPEC-002's schema table.
export const HANDLE_PATTERN = /^[a-z0-9_]{3,30}$/;
export const HANDLE_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export class UserNotFoundError extends Error {
  constructor() {
    super('User not found.');
    this.name = 'UserNotFoundError';
  }
}

export class HandleTakenError extends Error {
  constructor() {
    super('That handle is already taken.');
    this.name = 'HandleTakenError';
  }
}

export class HandleRateLimitedError extends Error {
  constructor() {
    super('Handle can only be changed once every 30 days.');
    this.name = 'HandleRateLimitedError';
  }
}

/** Field-keyed validation failure (SPEC-009: "Form errors: field-keyed, rendered adjacent to the input"). */
export class ProfileValidationError extends Error {
  constructor(public readonly fieldErrors: Record<string, string>) {
    super('Validation failed.');
    this.name = 'ProfileValidationError';
  }
}

/**
 * Tracks the last time each user changed their handle. In-process Map
 * (mirrors `src/server/auth/rate-limit.ts`'s established pattern: "no
 * Redis, a single process has no coordination problem to solve").
 *
 * DEC-044 (ruled): a persisted `users.handle_changed_at` column was
 * requested and explicitly NOT granted — adding a column + migration to
 * `schema.ts` is a data-model change to a DONE task's file, which CLAUDE.md
 * requires stopping on rather than treating as the same additive-function
 * exception granted for getCommentById/countFollowers/countFollowing
 * (DEC-044) and the `handle` field itself (DEC-047, an existing column
 * exposed on an existing update path — not a data-model change). It's with
 * the human now.
 *
 * This in-process tracker is therefore the SHIPPED implementation, not a
 * stand-in — but it is provisional in a real sense: it resets on server
 * restart, so the 30-day cooldown is enforced only within one process's
 * uptime, not durably across restarts the way SPEC-007's "not reserved...
 * changing it changes those URLs" framing implies it should be. Disclose
 * this criterion as not durably met, not as fully satisfied. If/when the
 * column lands, swapping this interface's implementation is a one-function
 * change — no call site here needs to move.
 */
export interface HandleChangeTracker {
  getLastChangedAt(userId: string): number | undefined;
  recordChange(userId: string, at: number): void;
}

export function createInMemoryHandleChangeTracker(): HandleChangeTracker {
  const lastChangedAt = new Map<string, number>();
  return {
    getLastChangedAt: (userId) => lastChangedAt.get(userId),
    recordChange: (userId, at) => {
      lastChangedAt.set(userId, at);
    },
  };
}

export interface UpdateProfileInput {
  displayName?: string;
  bio?: string | null;
  handle?: string;
  socialTwitter?: string | null;
  socialGithub?: string | null;
  socialWebsite?: string | null;
  avatarUploadId?: string | null;
  coverUploadId?: string | null;
}

function isBareHandle(value: string): boolean {
  return value.length > 0 && value.length <= 100 && !/^https?:\/\//i.test(value) && !value.includes('/');
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** True for a better-sqlite3 UNIQUE constraint violation (message form: `UNIQUE constraint failed: users.handle`). */
function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}

export interface UpdateProfileDeps {
  tracker: HandleChangeTracker;
  now?: number;
}

/**
 * Validates and applies a profile update. Field validation runs BEFORE any
 * write (SPEC-009: field-keyed errors, no partial-apply-then-fail). A
 * handle change is additionally checked against the 30-day cooldown and
 * uniqueness before being persisted.
 *
 * `users.handle` is UNIQUE NOT NULL (DEC-047's flagged hazard): the
 * proactive `getUserByHandle` check below closes the ordinary case, and
 * the write is still wrapped in a try/catch that maps a residual UNIQUE
 * violation to `HandleTakenError` rather than letting it surface as a raw
 * 500 — defense in depth, not the primary guard (this app's single
 * synchronous better-sqlite3 connection means there's no `await` between
 * the check and the write for another request to race into).
 */
export function updateProfile(
  db: MyrioDatabase,
  userId: string,
  input: UpdateProfileInput,
  deps: UpdateProfileDeps,
): User {
  const user = getUserById(db, userId);
  if (!user) {
    throw new UserNotFoundError();
  }

  const now = deps.now ?? Date.now();
  const fieldErrors: Record<string, string> = {};

  if (input.displayName !== undefined) {
    const len = input.displayName.length;
    if (len < DISPLAY_NAME_MIN_LENGTH || len > DISPLAY_NAME_MAX_LENGTH) {
      fieldErrors.displayName = `Must be ${DISPLAY_NAME_MIN_LENGTH}-${DISPLAY_NAME_MAX_LENGTH} characters.`;
    }
  }

  if (input.bio != null && input.bio.length > BIO_MAX_LENGTH) {
    fieldErrors.bio = `Must be at most ${BIO_MAX_LENGTH} characters.`;
  }

  if (input.socialTwitter != null && input.socialTwitter !== '' && !isBareHandle(input.socialTwitter)) {
    fieldErrors.socialTwitter = 'Must be a handle, not a URL.';
  }

  if (input.socialGithub != null && input.socialGithub !== '' && !isBareHandle(input.socialGithub)) {
    fieldErrors.socialGithub = 'Must be a handle, not a URL.';
  }

  if (input.socialWebsite != null && input.socialWebsite !== '' && !isHttpUrl(input.socialWebsite)) {
    fieldErrors.socialWebsite = 'Must be a valid http(s) URL.';
  }

  let normalizedHandle: string | undefined;
  const changingHandle = input.handle !== undefined && input.handle.trim().toLowerCase() !== user.handle;
  if (changingHandle) {
    normalizedHandle = input.handle!.trim().toLowerCase();
    if (!HANDLE_PATTERN.test(normalizedHandle)) {
      fieldErrors.handle = 'Must be 3-30 characters: lowercase letters, digits, underscore.';
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ProfileValidationError(fieldErrors);
  }

  if (normalizedHandle !== undefined) {
    const lastChangedAt = deps.tracker.getLastChangedAt(userId);
    if (lastChangedAt !== undefined && now - lastChangedAt < HANDLE_CHANGE_COOLDOWN_MS) {
      throw new HandleRateLimitedError();
    }
    const existing = getUserByHandle(db, normalizedHandle);
    if (existing && existing.id !== userId) {
      throw new HandleTakenError();
    }
  }

  let updated: User | undefined;
  try {
    updated = repoUpdateUserProfile(db, userId, {
      displayName: input.displayName,
      bio: input.bio,
      handle: normalizedHandle,
      avatarUploadId: input.avatarUploadId,
      coverUploadId: input.coverUploadId,
      socialTwitter: input.socialTwitter,
      socialGithub: input.socialGithub,
      socialWebsite: input.socialWebsite,
    });
  } catch (err) {
    if (normalizedHandle !== undefined && isUniqueConstraintError(err)) {
      throw new HandleTakenError();
    }
    throw err;
  }

  if (normalizedHandle !== undefined) {
    deps.tracker.recordChange(userId, now);
  }

  return updated ?? user;
}

export function getProfileByHandle(db: MyrioDatabase, handle: string): User | undefined {
  return getUserByHandle(db, handle);
}
