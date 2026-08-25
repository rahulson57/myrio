import { existsSync, rmSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { createDbClient, runMigrations, type MyrioDatabase } from '../client';
import {
  articles,
  claps,
  comments,
  conversations,
  follows,
  messages,
  notifications,
  tags,
  uploads,
  users,
} from '../schema';
import { seedDatabase, type SeedSummary } from './build';

/**
 * The testable core of `npm run db:reset` (SPEC-003: "delete + migrate +
 * seed (destructive-confirm prompt, `--force` for CI)"), parameterized by
 * `dbPath`/`uploadsDir` so a test suite can exercise it against a temp path
 * instead of the real `./data/myrio.db` (SPEC-001: "No test touches
 * `./data/myrio.db`"). `reset.ts` is the thin CLI wrapper that calls these
 * with the real paths and handles the interactive prompt.
 */

function countRows(db: MyrioDatabase, table: SQLiteTable): number {
  const row = db.select({ count: sql<number>`count(*)` }).from(table).get();
  return row?.count ?? 0;
}

export interface ExistingCounts {
  users: number;
  articles: number;
  tags: number;
  claps: number;
  comments: number;
  follows: number;
  uploads: number;
  conversations: number;
  messages: number;
  notifications: number;
}

/** Row counts for every table at `dbPath`, or `null` if no database file
 * exists there yet (nothing would be destroyed). */
export function readExistingCounts(dbPath: string): ExistingCounts | null {
  if (!existsSync(dbPath)) return null;

  const client = createDbClient(dbPath);
  try {
    return {
      users: countRows(client.db, users),
      articles: countRows(client.db, articles),
      tags: countRows(client.db, tags),
      claps: countRows(client.db, claps),
      comments: countRows(client.db, comments),
      follows: countRows(client.db, follows),
      uploads: countRows(client.db, uploads),
      conversations: countRows(client.db, conversations),
      messages: countRows(client.db, messages),
      notifications: countRows(client.db, notifications),
    };
  } finally {
    client.close();
  }
}

/** Deletes `dbPath` (and its `-wal`/`-shm` sidecars if present), migrates a
 * fresh connection, and seeds the full corpus into it. */
export function destroyMigrateSeed(dbPath: string, uploadsDir: string): SeedSummary {
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `${dbPath}${suffix}`;
    if (existsSync(p)) rmSync(p);
  }

  const client = createDbClient(dbPath);
  try {
    runMigrations(client.db);
    return seedDatabase(client.db, 'full', uploadsDir);
  } finally {
    client.close();
  }
}

/** Only a bare `y` (after trimming) proceeds; anything else — empty input,
 * `Y`, `yes`, whitespace, a typo — aborts. Deliberately strict: a
 * destructive prompt should never be satisfied by an almost-right answer. */
export function shouldProceed(answer: string): boolean {
  return answer.trim() === 'y';
}
