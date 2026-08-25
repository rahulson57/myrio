import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { MyrioDatabase } from '../client';
import { createArticle, type Article } from '../repositories/articles';
import { addClap } from '../repositories/claps';
import { createComment } from '../repositories/comments';
import { getOrCreateConversation } from '../repositories/conversations';
import { followUser } from '../repositories/follows';
import { sendMessage } from '../repositories/messages';
import { createNotification, type NotificationType } from '../repositories/notifications';
import { getOrCreateTag, setArticleTags, type Tag } from '../repositories/tags';
import { createUpload } from '../repositories/uploads';
import { createUser, type User } from '../repositories/users';
import { ARTICLE_MANIFEST, SEED_USERS } from './authors';
import { loadCorpus } from './corpus-loader';
import { PRNG_SEED, SEED_DEV_PASSWORD, SEED_EPOCH_MS } from './constants';
import { appendProvenanceFooter, deriveSeedArticleFields } from './derive';
import { createClock, createIdFactory } from './ids';
import { mulberry32, nextIntRange } from './prng';
import { PNG_WHITE, renderLabelPng, SEED_PALETTE } from './png';

export type SeedMode = 'full' | 'reduced';

export interface SeedSummary {
  users: number;
  tags: number;
  articlesPublished: number;
  articlesDraft: number;
  uploads: number;
  claps: number;
  comments: number;
  follows: number;
  conversations: number;
  messages: number;
  notifications: number;
}

const TAG_VOCAB = [
  'Nature',
  'Philosophy',
  'Mystery',
  'History',
  'Travel',
  'Science',
  'Poetry',
  'Memoir',
  'Adventure',
  'Society',
  'Letters',
  'Craft',
];

/** 1.5 minutes between successive deterministic timestamps. */
const CLOCK_STEP_MS = 90_000;
/** Every seeded timestamp is at least this far before SEED_EPOCH_MS. */
const CLOCK_SPAN_MS = 60 * 24 * 60 * 60 * 1000;

/** NOT a real password hash — see `authors.ts`/task notes: Auth & Session
 * (a later, not-yet-built slice) owns the real hashing scheme. This exists
 * only so `users.password_hash` (NOT NULL) has a deterministic value; every
 * seeded user's "password" is documented as SEED_DEV_PASSWORD, but signing
 * in as one will not work until Auth & Session lands and this placeholder
 * is replaced with a real hash of it. */
function placeholderPasswordHash(): string {
  return `seed-placeholder-hash:${SEED_DEV_PASSWORD}`;
}

function initials(displayName: string): string {
  const parts = displayName.split(' ').filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

interface BuildContext {
  db: MyrioDatabase;
  rng: () => number;
  nextId: () => string;
  tick: () => number;
  uploadsDir: string;
}

function seedTags(ctx: BuildContext): Map<string, Tag> {
  const tags = new Map<string, Tag>();
  for (const name of TAG_VOCAB) {
    const tag = getOrCreateTag(ctx.db, name, { id: ctx.nextId(), createdAt: ctx.tick() });
    tags.set(name, tag);
  }
  return tags;
}

function seedUsers(ctx: BuildContext, specs: typeof SEED_USERS): Map<string, User> {
  const users = new Map<string, User>();
  for (const spec of specs) {
    const createdAt = ctx.tick();
    const user = createUser(ctx.db, {
      email: `${spec.handle}@example.com`,
      passwordHash: placeholderPasswordHash(),
      handle: spec.handle,
      displayName: spec.displayName,
      bio: spec.bio,
      id: ctx.nextId(),
      createdAt,
      updatedAt: createdAt,
    });
    users.set(spec.handle, user);
  }
  return users;
}

/**
 * Writes one placeholder PNG directly under `ctx.uploadsDir` — no
 * subdirectory. SPEC-003's file scope for this path (`public/uploads/seed/`)
 * has no `**` suffix, so every seeded file lives as a direct child of that
 * directory; the caller distinguishes kinds via `filename`'s prefix
 * (`avatar-`/`cover-`) instead of a folder.
 */
function writeUploadPng(
  ctx: BuildContext,
  filename: string,
  width: number,
  height: number,
  label: string,
  paletteIndex: number,
): { diskPath: string; bytes: number; width: number; height: number } {
  mkdirSync(ctx.uploadsDir, { recursive: true });
  const bg = SEED_PALETTE[paletteIndex % SEED_PALETTE.length]!;
  const png = renderLabelPng(width, height, bg, label, PNG_WHITE);
  const absPath = path.join(ctx.uploadsDir, filename);
  writeFileSync(absPath, png);
  return {
    diskPath: `/uploads/seed/${filename}`,
    bytes: png.length,
    width,
    height,
  };
}

/**
 * Full corpus seed (SPEC-003 volumes: 12 users, 28 published + 6 draft
 * articles, 12 tags, ~400 claps, ~90 comments, ~40 follows, 5
 * conversations/~40 messages, ~60 notifications, 24 uploads).
 */
function seedFull(ctx: BuildContext): SeedSummary {
  const tags = seedTags(ctx);
  const users = seedUsers(ctx, SEED_USERS);
  const authorHandles = SEED_USERS.filter((u) => u.role === 'author').map((u) => u.handle);
  const allHandles = SEED_USERS.map((u) => u.handle);

  // --- Uploads: one avatar per user (12) -------------------------------
  let uploadCount = 0;
  SEED_USERS.forEach((spec, i) => {
    const png = writeUploadPng(ctx, `avatar-${spec.handle}.png`, 128, 128, initials(spec.displayName), i);
    createUpload(ctx.db, {
      ownerId: users.get(spec.handle)!.id,
      diskPath: png.diskPath,
      mime: 'image/png',
      bytes: png.bytes,
      width: png.width,
      height: png.height,
      kind: 'avatar',
      id: ctx.nextId(),
      createdAt: ctx.tick(),
    });
    uploadCount += 1;
  });

  // --- Articles (+ 12 cover uploads for the first 12 published) --------
  const corpus = loadCorpus();
  const manifestByTitle = new Map(ARTICLE_MANIFEST.map((m) => [m.title, m]));
  const articles: { article: Article; tagNames: string[]; status: 'draft' | 'published' }[] = [];
  let publishedCount = 0;
  let draftCount = 0;
  let coversAssigned = 0;
  const COVER_COUNT = 12;

  corpus.forEach((entry, i) => {
    const manifestEntry = manifestByTitle.get(entry.title);
    if (!manifestEntry) {
      throw new Error(`Corpus entry "${entry.title}" has no ARTICLE_MANIFEST entry.`);
    }
    const author = users.get(manifestEntry.handle);
    if (!author) {
      throw new Error(`ARTICLE_MANIFEST references unknown handle "${manifestEntry.handle}".`);
    }

    const bodyJsonWithProvenance = appendProvenanceFooter(entry.bodyJson, entry.source);
    const fields = deriveSeedArticleFields(entry.title, bodyJsonWithProvenance);
    const createdAt = ctx.tick();
    const isPublished = manifestEntry.status === 'published';

    let coverUploadId: string | null = null;
    if (isPublished && coversAssigned < COVER_COUNT) {
      const png = writeUploadPng(
        ctx,
        `cover-${fields.slug}.png`,
        640,
        360,
        entry.title.slice(0, 18),
        i,
      );
      const upload = createUpload(ctx.db, {
        ownerId: author.id,
        diskPath: png.diskPath,
        mime: 'image/png',
        bytes: png.bytes,
        width: png.width,
        height: png.height,
        kind: 'article_image',
        id: ctx.nextId(),
        createdAt: ctx.tick(),
      });
      coverUploadId = upload.id;
      coversAssigned += 1;
      uploadCount += 1;
    }

    const article = createArticle(ctx.db, {
      authorId: author.id,
      title: entry.title,
      subtitle: entry.subtitle,
      bodyJson: JSON.stringify(bodyJsonWithProvenance),
      slug: fields.slug,
      bodyHtml: fields.bodyHtml,
      excerpt: fields.excerpt,
      wordCount: fields.wordCount,
      readTimeMinutes: fields.readTimeMinutes,
      coverUploadId,
      status: manifestEntry.status,
      publishedAt: isPublished ? createdAt : null,
      id: ctx.nextId(),
      createdAt,
      updatedAt: createdAt,
    });

    setArticleTags(ctx.db, article.id, entry.tags);
    for (const tagName of entry.tags) {
      if (!tags.has(tagName)) {
        throw new Error(`Corpus tag "${tagName}" is not in the seed tag vocabulary.`);
      }
    }

    articles.push({ article, tagNames: entry.tags, status: manifestEntry.status });
    if (isPublished) publishedCount += 1;
    else draftCount += 1;
  });

  // --- Claps: every (article, user) pair, so the >= 400-row floor is ---
  // --- reachable at all (12 users x 28 published articles = 336 < 400, --
  // --- see TASK-019 proposal notes — drafts are included deliberately). -
  let clapCount = 0;
  for (const { article } of articles) {
    allHandles.forEach((handle) => {
      const user = users.get(handle)!;
      const delta = nextIntRange(ctx.rng, 1, 12);
      addClap(ctx.db, article.id, user.id, delta, {
        id: ctx.nextId(),
        createdAt: ctx.tick(),
        updatedAt: ctx.tick(),
      });
      clapCount += 1;
    });
  }

  // --- Comments: top-level + single-depth replies (SPEC-002 depth rule) -
  let commentCount = 0;
  let replyCount = 0;
  const topLevel: { id: string; articleId: string; authorId: string }[] = [];
  const published = articles.filter((a) => a.status === 'published');
  published.forEach(({ article }, i) => {
    const extra = i < 6 ? 1 : 0;
    const commentsHere = 2 + extra;
    for (let c = 0; c < commentsHere; c += 1) {
      const commenter = users.get(allHandles[(i + c) % allHandles.length]!)!;
      const comment = createComment(ctx.db, {
        articleId: article.id,
        authorId: commenter.id,
        bodyText: `A note on "${article.title}" — thoughtful, brief, and entirely in character.`,
        id: ctx.nextId(),
        createdAt: ctx.tick(),
      });
      commentCount += 1;
      topLevel.push({ id: comment.id, articleId: article.id, authorId: commenter.id });
    }
  });
  const replies: { id: string; articleId: string; authorId: string; parentAuthorId: string }[] = [];
  topLevel.slice(0, 32).forEach((parent, i) => {
    const replier = users.get(allHandles[(i + 5) % allHandles.length]!)!;
    const reply = createComment(ctx.db, {
      articleId: parent.articleId,
      authorId: replier.id,
      parentId: parent.id,
      bodyText: 'A brief reply, agreeing more than disagreeing.',
      id: ctx.nextId(),
      createdAt: ctx.tick(),
    });
    replyCount += 1;
    replies.push({ id: reply.id, articleId: parent.articleId, authorId: replier.id, parentAuthorId: parent.authorId });
  });

  // --- Follows: >= 40, and june-alvarez follows all 10 authors (>= 5) --
  let followCount = 0;
  const june = users.get('june-alvarez')!;
  authorHandles.forEach((handle) => {
    followUser(ctx.db, june.id, users.get(handle)!.id, { createdAt: ctx.tick() });
    followCount += 1;
  });
  allHandles
    .filter((h) => h !== 'june-alvarez')
    .forEach((handle) => {
      const follower = users.get(handle)!;
      const idx = allHandles.indexOf(handle);
      for (let o = 1; o <= 3; o += 1) {
        const target = users.get(allHandles[(idx + o) % allHandles.length]!)!;
        followUser(ctx.db, follower.id, target.id, { createdAt: ctx.tick() });
        followCount += 1;
      }
    });

  // --- Conversations + messages: exactly 5 conversations, >= 40 messages
  const pairs: [string, string][] = [
    ['elena-marsh', 'cormac-reyes'],
    ['priya-nandan', 'declan-oshea'],
    ['amara-osei', 'felix-tran'],
    ['sofia-lindqvist', 'malik-hassan'],
    ['greta-voss', 'ravi-chandran'],
  ];
  let messageCount = 0;
  const conversationRecords: { id: string; a: User; b: User; recentMessageIds: string[] }[] = [];
  pairs.forEach(([ha, hb]) => {
    const a = users.get(ha)!;
    const b = users.get(hb)!;
    const conversation = getOrCreateConversation(ctx.db, a.id, b.id, {
      id: ctx.nextId(),
      createdAt: ctx.tick(),
    });
    const recentMessageIds: string[] = [];
    for (let m = 0; m < 9; m += 1) {
      const sender = m % 2 === 0 ? a : b;
      const message = sendMessage(ctx.db, conversation.id, sender.id, `Message ${m + 1} in our thread.`, {
        id: ctx.nextId(),
        createdAt: ctx.tick(),
      });
      messageCount += 1;
      recentMessageIds.push(message.id);
    }
    conversationRecords.push({ id: conversation.id, a, b, recentMessageIds });
  });

  // --- Notifications: >= 60, mixed types, skipping self-actions --------
  let notificationCount = 0;
  interface NotifyExtra {
    articleId?: string | null;
    commentId?: string | null;
    messageId?: string | null;
  }
  const notify = (userId: string, actorId: string, type: NotificationType, extra: NotifyExtra = {}): void => {
    if (userId === actorId) return;
    const created = createNotification(ctx.db, {
      userId,
      actorId,
      type,
      id: ctx.nextId(),
      createdAt: ctx.tick(),
      ...extra,
    });
    if (created) notificationCount += 1;
  };

  const clapNotifyPairs: { articleAuthorId: string; actorId: string; articleId: string }[] = [];
  for (const { article } of articles) {
    for (const handle of allHandles) {
      if (clapNotifyPairs.length >= 20) break;
      clapNotifyPairs.push({ articleAuthorId: article.authorId, actorId: users.get(handle)!.id, articleId: article.id });
    }
    if (clapNotifyPairs.length >= 20) break;
  }
  clapNotifyPairs.forEach(({ articleAuthorId, actorId, articleId }) => {
    notify(articleAuthorId, actorId, 'clap', { articleId });
  });

  published.slice(0, 20).forEach(({ article }, i) => {
    const commenter = users.get(allHandles[i % allHandles.length]!)!;
    notify(article.authorId, commenter.id, 'comment', { articleId: article.id });
  });

  replies.slice(0, 10).forEach((reply) => {
    notify(reply.parentAuthorId, reply.authorId, 'reply', { articleId: reply.articleId, commentId: reply.id });
  });

  authorHandles.forEach((handle) => {
    notify(users.get(handle)!.id, june.id, 'follow', {});
  });

  conversationRecords.forEach(({ a, b, recentMessageIds }) => {
    recentMessageIds.slice(0, 2).forEach((messageId, i) => {
      const sender = i % 2 === 0 ? a : b;
      const recipient = sender.id === a.id ? b : a;
      notify(recipient.id, sender.id, 'message', { messageId });
    });
  });

  return {
    users: users.size,
    tags: tags.size,
    articlesPublished: publishedCount,
    articlesDraft: draftCount,
    uploads: uploadCount,
    claps: clapCount,
    comments: commentCount + replyCount,
    follows: followCount,
    conversations: conversationRecords.length,
    messages: messageCount,
    notifications: notificationCount,
  };
}

/**
 * Reduced seed for fast integration-test fixtures (SPEC-003 "Test
 * fixtures": `seedTestDb` — "3 users, 5 articles, 1 draft"). No
 * claps/comments/follows/uploads/notifications — those aren't part of the
 * reduced contract and would only cost time.
 */
function seedReduced(ctx: BuildContext): SeedSummary {
  const reducedUserSpecs = SEED_USERS.filter((u) =>
    ['elena-marsh', 'cormac-reyes', 'june-alvarez'].includes(u.handle),
  );
  const users = seedUsers(ctx, reducedUserSpecs);

  const reducedTitles = [
    'The Lamp at Merrow Point',
    'Fog Over the Shoals',
    "The Keeper's Last Watch",
    'The Night Train to Esting',
    'A Platform in the Rain',
    'Letters Never Sent',
  ];
  const corpus = loadCorpus().filter((c) => reducedTitles.includes(c.title));
  const manifestByTitle = new Map(ARTICLE_MANIFEST.map((m) => [m.title, m]));
  const tags = new Map<string, Tag>();

  let publishedCount = 0;
  let draftCount = 0;

  for (const title of reducedTitles) {
    const entry = corpus.find((c) => c.title === title);
    if (!entry) throw new Error(`Reduced seed: corpus entry "${title}" not found.`);
    const manifestEntry = manifestByTitle.get(title)!;
    const author = users.get(manifestEntry.handle)!;
    const bodyJsonWithProvenance = appendProvenanceFooter(entry.bodyJson, entry.source);
    const fields = deriveSeedArticleFields(entry.title, bodyJsonWithProvenance);
    const createdAt = ctx.tick();
    const isPublished = manifestEntry.status === 'published';

    const article = createArticle(ctx.db, {
      authorId: author.id,
      title: entry.title,
      subtitle: entry.subtitle,
      bodyJson: JSON.stringify(bodyJsonWithProvenance),
      slug: fields.slug,
      bodyHtml: fields.bodyHtml,
      excerpt: fields.excerpt,
      wordCount: fields.wordCount,
      readTimeMinutes: fields.readTimeMinutes,
      status: manifestEntry.status,
      publishedAt: isPublished ? createdAt : null,
      id: ctx.nextId(),
      createdAt,
      updatedAt: createdAt,
    });

    for (const tagName of entry.tags) {
      if (!tags.has(tagName)) {
        tags.set(tagName, getOrCreateTag(ctx.db, tagName, { id: ctx.nextId(), createdAt: ctx.tick() }));
      }
    }
    setArticleTags(ctx.db, article.id, entry.tags);

    if (isPublished) publishedCount += 1;
    else draftCount += 1;
  }

  return {
    users: users.size,
    tags: tags.size,
    articlesPublished: publishedCount,
    articlesDraft: draftCount,
    uploads: 0,
    claps: 0,
    comments: 0,
    follows: 0,
    conversations: 0,
    messages: 0,
    notifications: 0,
  };
}

export function seedDatabase(db: MyrioDatabase, mode: SeedMode, uploadsDir: string): SeedSummary {
  const ctx: BuildContext = {
    db,
    rng: mulberry32(PRNG_SEED),
    nextId: createIdFactory(mulberry32(PRNG_SEED), SEED_EPOCH_MS),
    tick: createClock(SEED_EPOCH_MS - CLOCK_SPAN_MS, CLOCK_STEP_MS),
    uploadsDir,
  };
  return mode === 'reduced' ? seedReduced(ctx) : seedFull(ctx);
}
