import { createTempDb, type TempDb } from '../setup/temp-db';
import {
  createDbClient,
  runMigrations,
  type DbClient,
  type MyrioDatabase,
} from '../../src/server/db/client';
import { createUser, type CreateUserInput } from '../../src/server/db/repositories/users';
import { createArticle, type CreateArticleInput } from '../../src/server/db/repositories/articles';

/**
 * Fresh, migrated temp SQLite connection for one Social Graph test suite
 * (SPEC-001: "Integration tests get a fresh temp SQLite file per suite").
 * Same shape as the Data Layer's own `__tests__/helpers.ts`, reimplemented
 * here rather than imported from it since that file lives outside this
 * task's file scope (src/server/db/repositories/__tests__/** is Data
 * Layer's) — this one only depends on tests/setup/temp-db.ts (shared,
 * read-only) and src/server/db/client.ts (Data Layer's public surface).
 */
export interface TestDb extends DbClient {
  cleanup: () => Promise<void>;
}

export async function createMigratedTestDb(): Promise<TestDb> {
  const temp: TempDb = await createTempDb();
  const client = createDbClient(temp.path);
  runMigrations(client.db);

  return {
    ...client,
    cleanup: async () => {
      client.close();
      await temp.cleanup();
    },
  };
}

let userCounter = 0;

export function makeUser(db: MyrioDatabase, overrides: Partial<CreateUserInput> = {}) {
  userCounter += 1;
  const n = userCounter;
  const input: CreateUserInput = {
    email: `user${n}@example.com`,
    passwordHash: 'x',
    handle: `user${n}`,
    displayName: `User ${n}`,
    ...overrides,
  };
  return createUser(db, input);
}

let articleCounter = 0;

export function makeArticle(
  db: MyrioDatabase,
  authorId: string,
  overrides: Partial<CreateArticleInput> = {},
) {
  articleCounter += 1;
  const n = articleCounter;
  const input: CreateArticleInput = {
    authorId,
    slug: `article-${n}`,
    title: `Article ${n}`,
    bodyJson: '{}',
    bodyHtml: '<p>Body</p>',
    excerpt: 'Body',
    wordCount: 1,
    readTimeMinutes: 1,
    status: 'published',
    publishedAt: Date.now(),
    ...overrides,
  };
  return createArticle(db, input);
}
