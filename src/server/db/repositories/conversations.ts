import { and, eq } from 'drizzle-orm';
import type { MyrioDatabase } from '../client';
import { conversationParticipants, conversations } from '../schema';

export type Conversation = typeof conversations.$inferSelect;

/**
 * Canonical uniqueness key: `min(userA,userB) || ':' || max(userA,userB)`
 * (SPEC-002), stored as `conversations.pair_key` (UNIQUE) so "message this
 * author" is idempotent. v1 is 1:1 only.
 */
export function computePairKey(userA: string, userB: string): string {
  const [a, b] = [userA, userB].sort();
  return `${a}:${b}`;
}

export interface GetOrCreateConversationOverrides {
  /** Overrides the default `$defaultFn`-generated id (SPEC-003: the seed
   * pipeline supplies a deterministic UUIDv7 here). Only applied when a
   * new conversation is actually created — a get-or-create hit ignores it. */
  id?: string;
  /** Overrides the default `Date.now()` stamp on `created_at` (SPEC-003
   * determinism). Omit for today's behaviour, unchanged. */
  createdAt?: number;
}

/**
 * Gets the 1:1 conversation between `userA` and `userB`, creating it (and
 * its two participant rows) if it doesn't exist yet, all in one
 * transaction. Idempotent: a duplicate `pair_key` insert is rejected by the
 * `conversations_pair_key_unique` index, so a race here fails the losing
 * transaction rather than creating a second conversation.
 */
export function getOrCreateConversation(
  db: MyrioDatabase,
  userA: string,
  userB: string,
  overrides?: GetOrCreateConversationOverrides,
): Conversation {
  if (userA === userB) {
    throw new Error('A conversation requires two distinct participants.');
  }
  const pairKey = computePairKey(userA, userB);

  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(conversations)
      .where(eq(conversations.pairKey, pairKey))
      .get();
    if (existing) {
      return existing;
    }

    const now = overrides?.createdAt ?? Date.now();
    const conversation = tx
      .insert(conversations)
      .values({
        ...(overrides?.id !== undefined ? { id: overrides.id } : {}),
        pairKey,
        createdAt: now,
        lastMessageAt: null,
      })
      .returning()
      .get();

    for (const userId of [userA, userB]) {
      tx.insert(conversationParticipants)
        .values({ conversationId: conversation.id, userId, lastReadAt: null })
        .run();
    }

    return conversation;
  });
}

export function getConversationByPairKey(
  db: MyrioDatabase,
  userA: string,
  userB: string,
): Conversation | undefined {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.pairKey, computePairKey(userA, userB)))
    .get();
}

export function markConversationRead(
  db: MyrioDatabase,
  conversationId: string,
  userId: string,
): void {
  db.update(conversationParticipants)
    .set({ lastReadAt: Date.now() })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    )
    .run();
}
