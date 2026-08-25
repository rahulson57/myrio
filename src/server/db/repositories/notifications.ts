import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { MyrioDatabase } from '../client';
import { notifications } from '../schema';

export type Notification = typeof notifications.$inferSelect;
export type NotificationType = (typeof notifications.$inferSelect)['type'];

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  actorId: string;
  articleId?: string | null;
  commentId?: string | null;
  messageId?: string | null;
  /** Overrides the default `$defaultFn`-generated id (SPEC-003: the seed
   * pipeline supplies a deterministic UUIDv7 here; every other caller
   * omits this and gets today's random-id behaviour, unchanged). */
  id?: string;
  /** Overrides the default `Date.now()` stamp on `created_at` (SPEC-003
   * determinism). Omit for today's behaviour, unchanged. */
  createdAt?: number;
}

/**
 * Creates a notification for `userId` caused by `actorId`. Self-actions
 * generate no notification (SPEC-002: "actor_id <> user_id enforced in the
 * service") — this repository is the write path every service call goes
 * through, so the guard lives here and returns `null` rather than throwing:
 * a self-action is a no-op, not an error.
 */
export function createNotification(
  db: MyrioDatabase,
  input: CreateNotificationInput,
): Notification | null {
  if (input.actorId === input.userId) {
    return null;
  }

  return db
    .insert(notifications)
    .values({
      ...(input.id !== undefined ? { id: input.id } : {}),
      userId: input.userId,
      type: input.type,
      actorId: input.actorId,
      articleId: input.articleId ?? null,
      commentId: input.commentId ?? null,
      messageId: input.messageId ?? null,
      createdAt: input.createdAt ?? Date.now(),
    })
    .returning()
    .get();
}

/** Served by `idx_notifications_user (user_id, read_at, created_at DESC)`. */
export function listNotifications(db: MyrioDatabase, userId: string): Notification[] {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .all();
}

/** Unread-count for the notification bell badge; served by the same index. */
export function countUnreadNotifications(db: MyrioDatabase, userId: string): number {
  const row = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .get();
  return row?.count ?? 0;
}

export function markNotificationRead(db: MyrioDatabase, id: string): Notification | undefined {
  return db
    .update(notifications)
    .set({ readAt: Date.now() })
    .where(eq(notifications.id, id))
    .returning()
    .get();
}
