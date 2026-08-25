import { createDbClient, runMigrations, type DbClient } from '../../src/server/db/client';
import { seedDatabase, type SeedSummary } from '../../src/server/db/seed/build';

export interface SeededTestDb extends DbClient {
  summary: SeedSummary;
}

/**
 * SPEC-003 "Test fixtures": `seedTestDb(dbPath)` — a fast, reduced
 * deterministic seed (3 users, 5 published articles, 1 draft) for
 * integration suites that need real seeded rows without the full corpus's
 * cost (p95 < 300 ms over 20 runs). Migrates `dbPath` (get one from
 * `tests/setup/temp-db.ts`'s `createTempDb()`) and seeds it in reduced
 * mode. Callers own `dbPath`'s lifecycle (create/cleanup) via
 * `createTempDb`, matching every other integration suite in this project.
 */
export function seedTestDb(dbPath: string): SeededTestDb {
  const client = createDbClient(dbPath);
  runMigrations(client.db);

  // Uploads aren't part of the reduced contract, but `seedDatabase` still
  // takes a directory argument — reduced mode never writes into it.
  const uploadsDir = `${dbPath}-uploads`;
  const summary = seedDatabase(client.db, 'reduced', uploadsDir);

  return { ...client, summary };
}
