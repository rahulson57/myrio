import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * A fresh, per-suite SQLite file location, per SPEC-001 (Governing
 * Constraints): "Integration tests get a fresh temp SQLite file per suite
 * (node:fs.mkdtemp + myrio-test-*.db), migrated then torn down. No test
 * touches ./data/myrio.db."
 */
export interface TempDb {
  /** Absolute path to this suite's SQLite file. Nothing exists at this path
   * until a caller opens/migrates a connection against it. */
  path: string;
  /** Removes the temp directory (the db file and any -wal/-shm sidecars
   * SQLite creates next to it in WAL mode). Safe to call even if nothing
   * was ever written. */
  cleanup: () => Promise<void>;
}

/**
 * Creates a fresh temp SQLite file location for one test suite.
 *
 * This helper only owns the file's lifecycle (naming, creation of its
 * containing directory, and teardown) so it has no dependency on the Data
 * Layer (schema/migrations/client), which is owned by a later slice.
 * Callers open a `better-sqlite3` connection against `path` and apply
 * migrations themselves; call `cleanup()` in an `afterAll`/`afterEach` to
 * remove the file (and its WAL/SHM sidecars) once the suite is done.
 */
export async function createTempDb(): Promise<TempDb> {
  const dir = await mkdtemp(join(tmpdir(), 'myrio-test-'));
  const path = join(dir, `myrio-test-${randomUUID()}.db`);

  return {
    path,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}
