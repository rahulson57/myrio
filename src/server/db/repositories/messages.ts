import { desc, eq } from 'drizzle-orm';
import type { MyrioDatabase } from '../client';
import { conversations, messages } from '../schema';

export type Message = typeof messages.$inferSelect;

/**
 * Sends a message and bumps `conversations.last_message_at`, in one
 * transaction so the thread-list ordering column never lags a message that
 * exists.
 */
export function sendMessage(
  db: MyrioDatabase,
  conversationId: string,
  senderId: string,
  bodyText: string,
): Message {
  return db.transaction((tx) => {
    const now = Date.now();
    const message = tx
      .insert(messages)
      .values({ conversationId, senderId, bodyText, createdAt: now })
      .returning()
      .get();

    tx.update(conversations)
      .set({ lastMessageAt: now })
      .where(eq(conversations.id, conversationId))
      .run();

    return message;
  });
}

/** Newest-first, served by `idx_messages_conv (conversation_id, created_at DESC)`. */
export function listMessages(db: MyrioDatabase, conversationId: string): Message[] {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .all();
}
