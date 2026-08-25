import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { logout } from '../../../src/app/api/auth/logout/route';
import { createSessionForUser } from '../../../src/server/auth/session';
import { createMigratedTestDb, createTestUser, jsonRequest, VALID_ORIGIN, type TestDb } from '../test-utils';

describe('POST /api/auth/logout', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('deletes the session row: a subsequent request with the same cookie is 401, and the row is gone', async () => {
    const { user } = await createTestUser(testDb.db);
    const session = createSessionForUser(testDb.db, user.id);
    const cookie = `myrio_session=${session.id}`;

    const req = jsonRequest('http://localhost:4310/api/auth/logout', { origin: VALID_ORIGIN, cookie });
    const res = await logout(req, testDb.db);

    expect(res.status).toBe(200);

    const row = testDb.sqlite.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
    expect(row).toBeUndefined();
    const count = testDb.sqlite.prepare('SELECT COUNT(*) as n FROM sessions').get() as { n: number };
    expect(count.n).toBe(0);

    // Reusing the same cookie now resolves to nothing.
    const secondReq = jsonRequest('http://localhost:4310/api/auth/logout', { origin: VALID_ORIGIN, cookie });
    const secondRes = await logout(secondReq, testDb.db);
    expect(secondRes.status).toBe(401);
  });

  it('clears the cookie on the response', async () => {
    const { user } = await createTestUser(testDb.db);
    const session = createSessionForUser(testDb.db, user.id);
    const req = jsonRequest('http://localhost:4310/api/auth/logout', {
      origin: VALID_ORIGIN,
      cookie: `myrio_session=${session.id}`,
    });
    const res = await logout(req, testDb.db);

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('Max-Age=0');
  });

  it('returns 401 without a session (requireUser is the first check)', async () => {
    const req = jsonRequest('http://localhost:4310/api/auth/logout', { origin: VALID_ORIGIN });
    const res = await logout(req, testDb.db);
    expect(res.status).toBe(401);
  });

  it('rejects a cross-origin request with 403 and does not delete the session', async () => {
    const { user } = await createTestUser(testDb.db);
    const session = createSessionForUser(testDb.db, user.id);

    const req = jsonRequest('http://localhost:4310/api/auth/logout', {
      origin: 'http://evil.example',
      cookie: `myrio_session=${session.id}`,
    });
    const res = await logout(req, testDb.db);

    expect(res.status).toBe(403);
    const row = testDb.sqlite.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
    expect(row).toBeDefined();
  });
});
