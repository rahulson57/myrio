import { mkdtemp } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDbClient, runMigrations, type DbClient } from '../../client';
import {
  articles,
  articleTags,
  claps,
  comments,
  conversations,
  conversationParticipants,
  follows,
  messages,
  notifications,
  tags,
  uploads,
  users,
} from '../../schema';
import { seedDatabase } from '../build';
import { deriveSeedArticleFields } from '../derive';
import { createTempDb, type TempDb } from '../../../../../tests/setup/temp-db';

/** Every table this suite dumps for a full row-by-row determinism check. */
const ALL_TABLES = {
  users,
  articles,
  articleTags,
  tags,
  claps,
  comments,
  follows,
  uploads,
  conversations,
  conversationParticipants,
  messages,
  notifications,
} as const;

function dumpAllTables(db: DbClient['db']): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const [name, table] of Object.entries(ALL_TABLES)) {
    out[name] = db.select().from(table).all();
  }
  return out;
}

async function migratedTempClient(): Promise<{ temp: TempDb; client: DbClient }> {
  const temp = await createTempDb();
  const client = createDbClient(temp.path);
  runMigrations(client.db);
  return { temp, client };
}

describe('seedDatabase full mode (SPEC-003 volumes)', () => {
  let temp: TempDb;
  let client: DbClient;
  let uploadsDir: string;

  beforeEach(async () => {
    ({ temp, client } = await migratedTempClient());
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'myrio-seed-uploads-'));
  });

  afterEach(async () => {
    client.close();
    await temp.cleanup();
  });

  it('produces exactly the counts SPEC-003 asserts as exact', () => {
    const summary = seedDatabase(client.db, 'full', uploadsDir);
    expect(summary.users).toBe(12);
    expect(summary.articlesPublished).toBe(28);
    expect(summary.articlesDraft).toBe(6);
    expect(summary.tags).toBe(12);
    expect(summary.uploads).toBe(24);
    expect(summary.conversations).toBe(5);
  });

  it('matches the summary counts with real COUNT(*) queries against every table', () => {
    seedDatabase(client.db, 'full', uploadsDir);
    expect(client.db.select().from(users).all().length).toBe(12);
    expect(client.db.select().from(articles).all().filter((a) => a.status === 'published').length).toBe(28);
    expect(client.db.select().from(articles).all().filter((a) => a.status === 'draft').length).toBe(6);
    expect(client.db.select().from(tags).all().length).toBe(12);
    expect(client.db.select().from(uploads).all().length).toBe(24);
    expect(client.db.select().from(conversations).all().length).toBe(5);
  });

  it('meets every floor SPEC-003 asserts as >=', () => {
    const summary = seedDatabase(client.db, 'full', uploadsDir);
    expect(summary.claps).toBeGreaterThanOrEqual(400);
    expect(summary.comments).toBeGreaterThanOrEqual(90);
    expect(summary.follows).toBeGreaterThanOrEqual(40);
    expect(summary.messages).toBeGreaterThanOrEqual(40);
    expect(summary.notifications).toBeGreaterThanOrEqual(60);
  });

  it('every published article has word_count >= 1000', () => {
    seedDatabase(client.db, 'full', uploadsDir);
    const published = client.db.select().from(articles).all().filter((a) => a.status === 'published');
    expect(published.length).toBeGreaterThan(0);
    expect(Math.min(...published.map((a) => a.wordCount))).toBeGreaterThanOrEqual(1000);
  });

  it('every tag is used by >= 2 articles', () => {
    seedDatabase(client.db, 'full', uploadsDir);
    const allTags = client.db.select().from(tags).all();
    const links = client.db.select().from(articleTags).all();
    for (const tag of allTags) {
      const usage = links.filter((l) => l.tagId === tag.id).length;
      expect(usage, `tag "${tag.displayName}" used ${usage} times`).toBeGreaterThanOrEqual(2);
    }
  });

  it('at least one user follows >= 5 authors (non-empty Following feed)', () => {
    seedDatabase(client.db, 'full', uploadsDir);
    const allFollows = client.db.select().from(follows).all();
    const byFollower = new Map<string, number>();
    for (const f of allFollows) byFollower.set(f.followerId, (byFollower.get(f.followerId) ?? 0) + 1);
    expect(Math.max(...byFollower.values())).toBeGreaterThanOrEqual(5);
  });

  it('re-derivation check: deriveSeedArticleFields(body_json) is byte-identical to the stored derived columns', () => {
    seedDatabase(client.db, 'full', uploadsDir);
    const all = client.db.select().from(articles).all();
    expect(all.length).toBe(34);
    for (const a of all) {
      const bodyJson = JSON.parse(a.bodyJson);
      const fields = deriveSeedArticleFields(a.title, bodyJson);
      expect(fields.bodyHtml).toBe(a.bodyHtml);
      expect(fields.excerpt).toBe(a.excerpt);
      expect(fields.wordCount).toBe(a.wordCount);
      expect(fields.readTimeMinutes).toBe(a.readTimeMinutes);
      expect(fields.slug).toBe(a.slug);
    }
  });

  it('every article carries non-null provenance rendered in its body footer (see MSG-2044: no provenance columns exist on `articles`)', () => {
    seedDatabase(client.db, 'full', uploadsDir);
    const all = client.db.select().from(articles).all();
    const published = all.filter((a) => a.status === 'published');
    expect(published.length).toBeGreaterThan(0);
    for (const a of published) {
      expect(a.bodyHtml).toMatch(/Source: .+ by .+ — .+ — license: public-domain\./);
    }
  });

  it('writes exactly 24 PNG files directly under the uploads directory (12 avatars + 12 covers, no subfolders)', () => {
    seedDatabase(client.db, 'full', uploadsDir);
    const files = readdirSync(uploadsDir).filter((f) => f.endsWith('.png'));
    expect(files.filter((f) => f.startsWith('avatar-')).length).toBe(12);
    expect(files.filter((f) => f.startsWith('cover-')).length).toBe(12);
    expect(files.length).toBe(24);
  });

  it('every upload row points at a file that actually exists on disk', () => {
    seedDatabase(client.db, 'full', uploadsDir);
    const allUploads = client.db.select().from(uploads).all();
    for (const u of allUploads) {
      // diskPath is like "/uploads/seed/avatar-x.png"; uploadsDir in this
      // test stands in for "public/uploads/seed", so strip that prefix.
      const relative = u.diskPath.replace(/^\/uploads\/seed\//, '');
      expect(existsSync(path.join(uploadsDir, relative)), u.diskPath).toBe(true);
    }
  });

  it('is deterministic: two independent clean-DB seeds produce byte-identical rows in every table, in every column, including ids and timestamps', async () => {
    const { temp: tempB, client: clientB } = await migratedTempClient();
    const uploadsDirB = await mkdtemp(path.join(tmpdir(), 'myrio-seed-uploads-b-'));
    try {
      seedDatabase(client.db, 'full', uploadsDir);
      seedDatabase(clientB.db, 'full', uploadsDirB);

      const dumpA = dumpAllTables(client.db);
      const dumpB = dumpAllTables(clientB.db);

      for (const name of Object.keys(ALL_TABLES)) {
        expect(dumpA[name], `table ${name}`).toEqual(dumpB[name]);
      }
    } finally {
      clientB.close();
      await tempB.cleanup();
    }
  });

  it('makes zero network calls (outbound sockets stubbed to throw still exits cleanly)', async () => {
    const net = await import('node:net');
    const originalConnect = net.Socket.prototype.connect;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (net.Socket.prototype as any).connect = () => {
      throw new Error('Network access attempted during seeding — this must never happen.');
    };
    try {
      expect(() => seedDatabase(client.db, 'full', uploadsDir)).not.toThrow();
    } finally {
      net.Socket.prototype.connect = originalConnect;
    }
  });
});

describe('seedDatabase reduced mode (SPEC-003 test fixtures)', () => {
  let temp: TempDb;
  let client: DbClient;

  beforeEach(async () => {
    ({ temp, client } = await migratedTempClient());
  });

  afterEach(async () => {
    client.close();
    await temp.cleanup();
  });

  it('produces exactly 3 users, 5 published articles, 1 draft', () => {
    const summary = seedDatabase(client.db, 'reduced', path.join(temp.path, '..', 'uploads'));
    expect(summary.users).toBe(3);
    expect(summary.articlesPublished).toBe(5);
    expect(summary.articlesDraft).toBe(1);

    expect(client.db.select().from(users).all().length).toBe(3);
    const all = client.db.select().from(articles).all();
    expect(all.filter((a) => a.status === 'published').length).toBe(5);
    expect(all.filter((a) => a.status === 'draft').length).toBe(1);
  });
});
