import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateUuidV7 } from '../../schema';
import { createUser } from '../users';
import { createMigratedTestDb, type TestDb } from './helpers';

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('timestamp convention (SPEC-002)', () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await createMigratedTestDb();
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  it('every column whose name ends in `_at` is INTEGER, never TEXT', () => {
    const tableRows = testDb.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'",
      )
      .all() as { name: string }[];
    const tableNames = tableRows.map((row) => row.name);

    const offenders: string[] = [];
    for (const table of tableNames) {
      const columns = testDb.sqlite.prepare(`PRAGMA table_info(${table})`).all() as {
        name: string;
        type: string;
      }[];
      for (const col of columns) {
        if (col.name.endsWith('_at') && col.type.toUpperCase() !== 'INTEGER') {
          offenders.push(`${table}.${col.name} (${col.type})`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('primary key convention (SPEC-002)', () => {
  it('generateUuidV7 produces well-formed UUIDv7 values (version 7, RFC 9562 variant)', () => {
    const ids = Array.from({ length: 20 }, () => generateUuidV7());
    for (const id of ids) {
      expect(id).toMatch(UUID_V7_RE);
    }
    // No duplicates across a small batch.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('generateUuidV7 is time-ordered across distinct milliseconds', async () => {
    const first = generateUuidV7();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = generateUuidV7();
    expect(first < second).toBe(true);
  });

  it('every primary key created through a repository is a UUIDv7 whose lexical order matches created_at order', async () => {
    const testDb = await createMigratedTestDb();
    try {
      const created = [];
      for (let i = 0; i < 5; i += 1) {
        created.push(
          createUser(testDb.db, {
            email: `user-${i}@example.com`,
            passwordHash: 'hash',
            handle: `user_${i}`,
            displayName: `User ${i}`,
          }),
        );
        // Force distinct millisecond timestamps so ordering is unambiguous.
        await new Promise((resolve) => setTimeout(resolve, 2));
      }

      for (const user of created) {
        expect(user.id).toMatch(UUID_V7_RE);
      }

      const byCreatedAt = [...created].sort((a, b) => a.createdAt - b.createdAt);
      const byId = [...created].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      expect(byId.map((u) => u.id)).toEqual(byCreatedAt.map((u) => u.id));
    } finally {
      await testDb.cleanup();
    }
  });
});
