import { eq } from 'drizzle-orm';
import type { MyrioDatabase } from '../client';
import { users } from '../schema';

export type User = typeof users.$inferSelect;

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  handle: string;
  displayName: string;
  bio?: string | null;
  socialTwitter?: string | null;
  socialGithub?: string | null;
  socialWebsite?: string | null;
  /** Overrides the default `$defaultFn`-generated id (SPEC-003: the seed
   * pipeline supplies a deterministic UUIDv7 here; every other caller
   * omits this and gets today's random-id behaviour, unchanged). */
  id?: string;
  /** Overrides the default `Date.now()` stamp on `created_at`/`updated_at`
   * (SPEC-003 determinism). Omit for today's behaviour, unchanged. */
  createdAt?: number;
  updatedAt?: number;
}

/** Creates a user. Email/handle are normalized (trimmed, lowercased) here —
 * the only place `users` rows are written. */
export function createUser(db: MyrioDatabase, input: CreateUserInput): User {
  const now = Date.now();
  return db
    .insert(users)
    .values({
      ...(input.id !== undefined ? { id: input.id } : {}),
      email: input.email.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      handle: input.handle.trim().toLowerCase(),
      displayName: input.displayName,
      bio: input.bio ?? null,
      socialTwitter: input.socialTwitter ?? null,
      socialGithub: input.socialGithub ?? null,
      socialWebsite: input.socialWebsite ?? null,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    })
    .returning()
    .get();
}

export function getUserById(db: MyrioDatabase, id: string): User | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function getUserByEmail(db: MyrioDatabase, email: string): User | undefined {
  return db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .get();
}

export function getUserByHandle(db: MyrioDatabase, handle: string): User | undefined {
  return db
    .select()
    .from(users)
    .where(eq(users.handle, handle.trim().toLowerCase()))
    .get();
}

export interface UpdateUserProfileInput {
  displayName?: string;
  bio?: string | null;
  /** Added under DEC-047 (Social Graph/TASK-022): `handle` already exists
   * on `users` (unique, set at insert) but was never exposed on update —
   * PATCH /api/profile needs to change it. Purely additive: an existing
   * column, a widened interface, no schema/migration change. NOTE this
   * column is UNIQUE NOT NULL — setting it to a value another row already
   * holds raises a SQLite constraint error rather than returning
   * `undefined` the way a missing-row update does; callers must check
   * uniqueness themselves first (src/server/services/profiles.ts does). */
  handle?: string;
  avatarUploadId?: string | null;
  coverUploadId?: string | null;
  socialTwitter?: string | null;
  socialGithub?: string | null;
  socialWebsite?: string | null;
}

export function updateUserProfile(
  db: MyrioDatabase,
  id: string,
  input: UpdateUserProfileInput,
): User | undefined {
  return db
    .update(users)
    .set({ ...input, updatedAt: Date.now() })
    .where(eq(users.id, id))
    .returning()
    .get();
}
