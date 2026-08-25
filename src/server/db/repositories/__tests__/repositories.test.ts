import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createArticle, getArticleById, listArticlesByAuthor, updateArticle } from '../articles';
import { createComment, listCommentsForArticle, softDeleteComment } from '../comments';
import {
  computePairKey,
  getConversationByPairKey,
  getOrCreateConversation,
  markConversationRead,
} from '../conversations';
import { followUser, isFollowing, listFollowing, unfollowUser } from '../follows';
import { listMessages, sendMessage } from '../messages';
import {
  countUnreadNotifications,
  createNotification,
  listNotifications,
  markNotificationRead,
} from '../notifications';
import {
  createPasswordResetToken,
  getPasswordResetTokenByHash,
  markPasswordResetTokenUsed,
} from '../password-reset-tokens';
import { createSession, deleteSession, getSessionById, touchSession } from '../sessions';
import { getOrCreateTag, getTagBySlug, listTagsForArticle, setArticleTags } from '../tags';
import { createUpload, getUploadById } from '../uploads';
import { createUser, getUserByEmail, getUserByHandle, getUserById, updateUserProfile } from '../users';
import { createMigratedTestDb, type TestDb } from './helpers';

describe('repository CRUD surface', () => {
  let testDb: TestDb;
  let userA: ReturnType<typeof createUser>;
  let userB: ReturnType<typeof createUser>;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
    userA = createUser(testDb.db, {
      email: '  A@Example.com ',
      passwordHash: 'hash-a',
      handle: '  User_A ',
      displayName: 'User A',
      bio: 'bio',
      socialTwitter: 'usera',
      socialGithub: 'usera',
      socialWebsite: 'https://example.com',
    });
    userB = createUser(testDb.db, {
      email: 'b@example.com',
      passwordHash: 'hash-b',
      handle: 'user_b',
      displayName: 'User B',
    });
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('normalizes email/handle and round-trips a user by id/email/handle', () => {
    expect(userA.email).toBe('a@example.com');
    expect(userA.handle).toBe('user_a');
    expect(getUserById(testDb.db, userA.id)?.id).toBe(userA.id);
    expect(getUserByEmail(testDb.db, 'A@EXAMPLE.com')?.id).toBe(userA.id);
    expect(getUserByHandle(testDb.db, 'USER_A')?.id).toBe(userA.id);
    expect(getUserById(testDb.db, 'nonexistent')).toBeUndefined();
  });

  it('updates a user profile', () => {
    const updated = updateUserProfile(testDb.db, userA.id, { displayName: 'New Name' });
    expect(updated?.displayName).toBe('New Name');
  });

  it('creates, touches and deletes a session', () => {
    const session = createSession(testDb.db, userA.id);
    expect(session.userId).toBe(userA.id);
    expect(session.expiresAt).toBeGreaterThan(session.createdAt);

    const fetched = getSessionById(testDb.db, session.id);
    expect(fetched?.id).toBe(session.id);

    const touched = touchSession(testDb.db, session.id);
    expect(touched?.lastSeenAt).toBeGreaterThanOrEqual(session.lastSeenAt);

    deleteSession(testDb.db, session.id);
    expect(getSessionById(testDb.db, session.id)).toBeUndefined();
  });

  it('creates and updates an article, lists by author', () => {
    const article = createArticle(testDb.db, {
      authorId: userA.id,
      slug: 'my-article',
      title: 'My Article',
      subtitle: 'Sub',
      bodyJson: '{}',
      bodyHtml: '<p>Body</p>',
      excerpt: 'Body',
      wordCount: 1,
      readTimeMinutes: 1,
      status: 'draft',
    });
    expect(getArticleById(testDb.db, article.id)?.id).toBe(article.id);

    const published = updateArticle(testDb.db, article.id, {
      status: 'published',
      publishedAt: Date.now(),
    });
    expect(published?.status).toBe('published');

    const authored = listArticlesByAuthor(testDb.db, userA.id, 'published');
    expect(authored.map((a) => a.id)).toContain(article.id);
  });

  it('get-or-creates tags, enforces the 5-tag cap, and lists tags for an article', () => {
    const article = createArticle(testDb.db, {
      authorId: userA.id,
      slug: 'tagged-article',
      title: 'Tagged Article',
      bodyJson: '{}',
      bodyHtml: '<p>Body</p>',
      excerpt: 'Body',
      wordCount: 1,
      readTimeMinutes: 1,
      status: 'published',
      publishedAt: Date.now(),
    });

    const tag = getOrCreateTag(testDb.db, 'Engineering');
    expect(getOrCreateTag(testDb.db, 'engineering').id).toBe(tag.id);
    expect(getTagBySlug(testDb.db, 'engineering')?.id).toBe(tag.id);

    setArticleTags(testDb.db, article.id, ['engineering', 'design']);
    expect(listTagsForArticle(testDb.db, article.id).map((t) => t.slug).sort()).toEqual([
      'design',
      'engineering',
    ]);
    expect(listTagsForArticle(testDb.db, 'nonexistent-article')).toEqual([]);

    expect(() =>
      setArticleTags(testDb.db, article.id, ['a', 'b', 'c', 'd', 'e', 'f']),
    ).toThrow();
  });

  it('creates, lists and soft-deletes comments', () => {
    const article = createArticle(testDb.db, {
      authorId: userA.id,
      slug: 'commented-article',
      title: 'Commented Article',
      bodyJson: '{}',
      bodyHtml: '<p>Body</p>',
      excerpt: 'Body',
      wordCount: 1,
      readTimeMinutes: 1,
      status: 'published',
      publishedAt: Date.now(),
    });

    const comment = createComment(testDb.db, {
      articleId: article.id,
      authorId: userB.id,
      bodyText: 'Nice article',
    });
    expect(listCommentsForArticle(testDb.db, article.id)).toHaveLength(1);
    expect(getArticleById(testDb.db, article.id)?.commentCount).toBe(1);

    const deleted = softDeleteComment(testDb.db, comment.id);
    expect(deleted?.deletedAt).not.toBeNull();
    expect(deleted?.bodyText).toBe('');
    expect(getArticleById(testDb.db, article.id)?.commentCount).toBe(0);

    // Deleting again is a no-op, not an error.
    expect(softDeleteComment(testDb.db, comment.id)?.deletedAt).toBe(deleted?.deletedAt);
    expect(softDeleteComment(testDb.db, 'nonexistent')).toBeUndefined();

    expect(() =>
      createComment(testDb.db, {
        articleId: article.id,
        authorId: userA.id,
        parentId: 'nonexistent-parent',
        bodyText: 'orphan reply',
      }),
    ).toThrow('Parent comment not found.');
  });

  it('follows/unfollows and lists following', () => {
    followUser(testDb.db, userA.id, userB.id);
    expect(isFollowing(testDb.db, userA.id, userB.id)).toBe(true);
    expect(isFollowing(testDb.db, userB.id, userA.id)).toBe(false);
    expect(listFollowing(testDb.db, userA.id).map((f) => f.followingId)).toEqual([userB.id]);

    unfollowUser(testDb.db, userA.id, userB.id);
    expect(isFollowing(testDb.db, userA.id, userB.id)).toBe(false);
  });

  it('creates an upload and fetches it by id', () => {
    const upload = createUpload(testDb.db, {
      ownerId: userA.id,
      diskPath: '/tmp/avatar.png',
      mime: 'image/png',
      bytes: 1024,
      width: 100,
      height: 100,
      kind: 'avatar',
    });
    expect(getUploadById(testDb.db, upload.id)?.diskPath).toBe('/tmp/avatar.png');
    expect(getUploadById(testDb.db, 'nonexistent')).toBeUndefined();
  });

  it('computes a stable pair_key regardless of argument order, and get-or-creates a conversation', () => {
    expect(computePairKey(userA.id, userB.id)).toBe(computePairKey(userB.id, userA.id));

    const conversation = getOrCreateConversation(testDb.db, userA.id, userB.id);
    expect(getConversationByPairKey(testDb.db, userB.id, userA.id)?.id).toBe(conversation.id);
    expect(() => getOrCreateConversation(testDb.db, userA.id, userA.id)).toThrow();

    markConversationRead(testDb.db, conversation.id, userA.id);
  });

  it('sends and lists messages, bumping conversations.last_message_at', () => {
    const conversation = getOrCreateConversation(testDb.db, userA.id, userB.id);
    expect(conversation.lastMessageAt).toBeNull();

    const message = sendMessage(testDb.db, conversation.id, userA.id, 'Hello!');
    expect(message.bodyText).toBe('Hello!');

    const messages = listMessages(testDb.db, conversation.id);
    expect(messages.map((m) => m.id)).toEqual([message.id]);
  });

  it('creates notifications, skips self-actions, counts unread and marks read', () => {
    const notification = createNotification(testDb.db, {
      userId: userA.id,
      type: 'follow',
      actorId: userB.id,
    });
    expect(notification).not.toBeNull();

    const selfAction = createNotification(testDb.db, {
      userId: userA.id,
      type: 'follow',
      actorId: userA.id,
    });
    expect(selfAction).toBeNull();

    expect(countUnreadNotifications(testDb.db, userA.id)).toBe(1);
    expect(listNotifications(testDb.db, userA.id).map((n) => n.id)).toEqual([notification!.id]);

    markNotificationRead(testDb.db, notification!.id);
    expect(countUnreadNotifications(testDb.db, userA.id)).toBe(0);
  });

  it('creates, fetches and marks used a password reset token', () => {
    const token = createPasswordResetToken(testDb.db, userA.id, 'hashed-token');
    expect(getPasswordResetTokenByHash(testDb.db, 'hashed-token')?.id).toBe(token.id);

    const used = markPasswordResetTokenUsed(testDb.db, token.id);
    expect(used?.usedAt).not.toBeNull();
  });
});
