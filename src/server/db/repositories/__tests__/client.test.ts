import { afterEach, describe, expect, it } from 'vitest';
import { createTempDb, type TempDb } from '../../../../../tests/setup/temp-db';
import { createDbClient, type DbClient } from '../../client';

/**
 * SPEC-002 acceptance: "Every connection opened by `src/server/db/client.ts`
 * has `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL`; an
 * integration test asserts both pragmas return the expected value on a
 * fresh connection."
 */
describe('createDbClient pragmas (SPEC-002)', () => {
  let temp: TempDb;
  let client: DbClient;

  afterEach(async () => {
    client?.close();
    await temp?.cleanup();
  });

  it('sets foreign_keys = ON on a fresh connection', async () => {
    temp = await createTempDb();
    client = createDbClient(temp.path);

    const rows = client.sqlite.pragma('foreign_keys') as { foreign_keys: number }[];
    expect(rows[0]?.foreign_keys).toBe(1);
  });

  it('sets journal_mode = WAL on a fresh connection', async () => {
    temp = await createTempDb();
    client = createDbClient(temp.path);

    const rows = client.sqlite.pragma('journal_mode') as { journal_mode: string }[];
    expect(rows[0]?.journal_mode).toBe('wal');
  });
});
