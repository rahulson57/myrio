import {
  getUserById,
  getUserByHandle,
  updateUserProfile as repoUpdateUserProfile,
  type User,
} from '../db/repositories/users';
import type { MyrioDatabase } from '../db/client';

/**
 * Profiles service (SPEC-007 "Profile"). Validates `PATCH /api/profile`
 * inputs and orchestrates the update. The handle-change path needs a
 * repository capability that doesn't exist yet (`UpdateUserProfileInput`
 * has no `handle` field at all) — flagged separately from the rate-limit
 * clock question below (MSG-2065), still open. Until it lands, that one
 * path is wired behind an injected function so the rest of this module
 * (which needs none of it) is complete and independently testable.
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
 * exception already granted elsewhere (getCommentById,
 * countFollowers/countFollowing). It's with the human now.
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

/**
 * Persists a handle change. No default implementation exists yet — the
 * repository's `UpdateUserProfileInput` has no `handle` field (pending
 * grant). Callers that don't change `handle` never need this.
 */
export type PersistHandleChangeFn = (
  db: MyrioDatabase,
  userId: string,
  handle: string,
) => User | undefined;

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

export interface UpdateProfileDeps {
  tracker: HandleChangeTracker;
  persistHandleChange?: PersistHandleChangeFn;
  now?: number;
}

/**
 * Validates and applies a profile update. Field validation runs BEFORE any
 * write (SPEC-009: field-keyed errors, no partial-apply-then-fail). A
 * handle change is additionally checked for the 30-day cooldown and
 * uniqueness before being persisted via `deps.persistHandleChange`.
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

  let result: User | undefined = user;

  if (normalizedHandle !== undefined) {
    if (!deps.persistHandleChange) {
      throw new Error(
        'Handle updates are not yet supported: UpdateUserProfileInput has no `handle` field ' +
          '(pending Data Layer grant — see this task\'s proposal notes).',
      );
    }
    result = deps.persistHandleChange(db, userId, normalizedHandle) ?? result;
    deps.tracker.recordChange(userId, now);
  }

  const rest = repoUpdateUserProfile(db, userId, {
    displayName: input.displayName,
    bio: input.bio,
    avatarUploadId: input.avatarUploadId,
    coverUploadId: input.coverUploadId,
    socialTwitter: input.socialTwitter,
    socialGithub: input.socialGithub,
    socialWebsite: input.socialWebsite,
  });

  return rest ?? result;
}

export function getProfileByHandle(db: MyrioDatabase, handle: string): User | undefined {
  return getUserByHandle(db, handle);
}
