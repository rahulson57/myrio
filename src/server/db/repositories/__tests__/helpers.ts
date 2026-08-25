import { createTempDb, type TempDb } from '../../../../../tests/setup/temp-db';
import { createDbClient, runMigrations, type DbClient } from '../../client';

/**
 * Opens a fresh, migrated temp SQLite connection for one test suite (per
 * SPEC-001: "Integration tests get a fresh temp SQLite file per suite").
 * Builds on `tests/setup/temp-db.ts` (path lifecycle only) plus this
 * module's own migration/connection logic.
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
