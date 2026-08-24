import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

/**
 * Data Layer connection module (SPEC-002). This is the ONLY place a raw
 * better-sqlite3 connection is opened — every other module (including the
 * seed pipeline) reaches SQLite through a repository function exported from
 * `src/server/db/repositories/**`, never by opening its own connection.
 */

export type MyrioDatabase = BetterSQLite3Database<typeof schema>;

export interface DbClient {
  db: MyrioDatabase;
  sqlite: Database.Database;
  close: () => void;
}

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'myrio.db');

/**
 * Opens a SQLite connection at `dbPath` (default `./data/myrio.db`) with the
 * pragmas SPEC-002's Conventions require on every connection:
 * `foreign_keys = ON` and `journal_mode = WAL`.
 *
 * Integration tests pass an explicit temp-file path (see
 * `tests/setup/temp-db.ts`) so `./data/myrio.db` is never touched by `npm
 * test`.
 */
export function createDbClient(dbPath: string = DEFAULT_DB_PATH): DbClient {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('journal_mode = WAL');

  const db = drizzle(sqlite, { schema });

  return {
    db,
    sqlite,
    close: () => {
      sqlite.close();
    },
  };
}

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle');

/**
 * Applies every migration under `drizzle/**` to `db` (`drizzle-kit
 * generate`'s output — see `drizzle.config.ts`). Used by `npm run
 * db:migrate` (via the `drizzle-kit migrate` CLI) and directly by
 * integration tests, which migrate their own temp SQLite file per suite.
 */
export function runMigrations(db: MyrioDatabase): void {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

let defaultClient: DbClient | undefined;

/**
 * Lazily-created singleton connection to `./data/myrio.db`, for runtime
 * (non-test) callers that don't manage their own `DbClient` lifecycle.
 */
export function getDb(): MyrioDatabase {
  defaultClient ??= createDbClient();
  return defaultClient.db;
}
