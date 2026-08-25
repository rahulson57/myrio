import { eq } from 'drizzle-orm';
import type { MyrioDatabase } from '../client';
import { passwordResetTokens } from '../schema';

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Creates a single-use, 1h-TTL reset token. Caller supplies the hash — this
 * module never sees the raw token (lifecycle owned by the Auth section). */
export function createPasswordResetToken(
  db: MyrioDatabase,
  userId: string,
  tokenHash: string,
): PasswordResetToken {
  const now = Date.now();
  return db
    .insert(passwordResetTokens)
    .values({ userId, tokenHash, expiresAt: now + ONE_HOUR_MS, createdAt: now })
    .returning()
    .get();
}

export function getPasswordResetTokenByHash(
  db: MyrioDatabase,
  tokenHash: string,
): PasswordResetToken | undefined {
  return db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .get();
}

/** Marks a token used. Single-use: callers must check `usedAt`/`expiresAt`
 * themselves before accepting the token (this module only records state). */
export function markPasswordResetTokenUsed(
  db: MyrioDatabase,
  id: string,
): PasswordResetToken | undefined {
  return db
    .update(passwordResetTokens)
    .set({ usedAt: Date.now() })
    .where(eq(passwordResetTokens.id, id))
    .returning()
    .get();
}
