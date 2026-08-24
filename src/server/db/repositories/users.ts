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
}

/** Creates a user. Email/handle are normalized (trimmed, lowercased) here —
 * the only place `users` rows are written. */
export function createUser(db: MyrioDatabase, input: CreateUserInput): User {
  const now = Date.now();
  return db
    .insert(users)
    .values({
      email: input.email.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      handle: input.handle.trim().toLowerCase(),
      displayName: input.displayName,
      bio: input.bio ?? null,
      socialTwitter: input.socialTwitter ?? null,
      socialGithub: input.socialGithub ?? null,
      socialWebsite: input.socialWebsite ?? null,
      createdAt: now,
      updatedAt: now,
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
