import { mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDbClient, runMigrations } from '../../client';
import { destroyMigrateSeed, readExistingCounts, shouldProceed } from '../reset-core';

describe('shouldProceed', () => {
  it('proceeds only on a bare "y"', () => {
    expect(shouldProceed('y')).toBe(true);
    expect(shouldProceed(' y \n')).toBe(true);
  });

  it('aborts on anything else — empty, Y, yes, a typo', () => {
    expect(shouldProceed('')).toBe(false);
    expect(shouldProceed('Y')).toBe(false);
    expect(shouldProceed('yes')).toBe(false);
    expect(shouldProceed('n')).toBe(false);
    expect(shouldProceed('  ')).toBe(false);
  });
});

describe('readExistingCounts', () => {
  it('returns null when no database file exists at the path', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'myrio-reset-'));
    const dbPath = path.join(dir, 'nonexistent.db');
    expect(readExistingCounts(dbPath)).toBeNull();
  });

  it('returns real row counts for an existing, seeded database', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'myrio-reset-'));
    const dbPath = path.join(dir, 'myrio.db');
    const uploadsDir = path.join(dir, 'uploads');
    const summary = destroyMigrateSeed(dbPath, uploadsDir);

    const counts = readExistingCounts(dbPath);
    expect(counts).not.toBeNull();
    expect(counts!.users).toBe(summary.users);
    expect(counts!.articles).toBe(summary.articlesPublished + summary.articlesDraft);
    expect(counts!.tags).toBe(summary.tags);
    expect(counts!.uploads).toBe(summary.uploads);
    expect(counts!.conversations).toBe(summary.conversations);
  });
});

describe('destroyMigrateSeed', () => {
  it('creates a fresh, migrated, fully seeded database at dbPath', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'myrio-reset-'));
    const dbPath = path.join(dir, 'myrio.db');
    const uploadsDir = path.join(dir, 'uploads');

    const summary = destroyMigrateSeed(dbPath, uploadsDir);
    expect(summary.users).toBe(12);
    expect(existsSync(dbPath)).toBe(true);
  });

  it('deletes an existing db (and -wal/-shm sidecars) before reseeding, rather than appending to it', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'myrio-reset-'));
    const dbPath = path.join(dir, 'myrio.db');
    const uploadsDir = path.join(dir, 'uploads');

    destroyMigrateSeed(dbPath, uploadsDir);
    // A second reset must not collide with unique constraints from the
    // first pass's rows (it deletes first) — if it re-seeded on top of the
    // existing file this would throw a UNIQUE constraint violation.
    expect(() => destroyMigrateSeed(dbPath, uploadsDir)).not.toThrow();

    const client = createDbClient(dbPath);
    runMigrations(client.db); // no-op: already migrated, proves the file is a valid fresh DB
    client.close();
  });
});
