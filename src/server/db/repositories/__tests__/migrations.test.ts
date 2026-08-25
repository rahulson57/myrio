import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createMigratedTestDb, type TestDb } from './helpers';

/**
 * SPEC-002 acceptance: "`npm run db:migrate` on an empty `./data/` creates
 * every table, index and constraint listed in this section; a schema-diff
 * test (`drizzle-kit check`) reports zero pending changes against
 * `schema.ts`."
 */
describe('migrations (SPEC-002)', () => {
  let testDb: TestDb;

  it('applies cleanly to a fresh SQLite file and creates every table', async () => {
    testDb = await createMigratedTestDb();

    const tableNames = testDb.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'",
      )
      .all() as { name: string }[];

    const tableNamesSorted = tableNames.map((row) => row.name).sort();

    expect(tableNamesSorted).toEqual(
      [
        'article_tags',
        'articles',
        'claps',
        'comments',
        'conversation_participants',
        'conversations',
        'follows',
        'messages',
        'notifications',
        'password_reset_tokens',
        'sessions',
        'tags',
        'uploads',
        'users',
      ].sort(),
    );
  });

  it('creates all 8 required indexes', () => {
    const indexRows = testDb.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'")
      .all() as { name: string }[];
    const indexNamesSorted = indexRows.map((row) => row.name).sort();

    expect(indexNamesSorted).toEqual(
      [
        'idx_articles_feed',
        'idx_articles_author',
        'idx_article_tags_tag',
        'idx_comments_article',
        'idx_claps_article_user',
        'idx_follows_follower',
        'idx_notifications_user',
        'idx_messages_conv',
      ].sort(),
    );
  });

  afterAll(async () => {
    await testDb?.cleanup();
  });
});

describe('schema-diff (drizzle-kit check)', () => {
  it('reports zero pending changes against schema.ts', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
    const output = execFileSync('npx', ['drizzle-kit', 'check'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(output).not.toMatch(/error|conflict|pending/i);
  });
});
