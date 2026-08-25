import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { forgot } from '../../../src/app/api/auth/forgot/route';
import { reset } from '../../../src/app/api/auth/reset/route';
import { login } from '../../../src/app/api/auth/login/route';
import { createSessionForUser } from '../../../src/server/auth/session';
import { resetRateLimitStore } from '../../../src/server/auth/rate-limit';
import { createMigratedTestDb, createTestUser, jsonRequest, VALID_ORIGIN, type TestDb } from '../test-utils';

/** Pulls the raw reset token out of the console.log line `forgot` prints,
 * without asserting anything about its exact wording. */
function extractTokenFromLog(logArgs: unknown[][]): string {
  for (const args of logArgs) {
    const line = String(args[0] ?? '');
    const match = line.match(/token=([\w-]+)/);
    if (match?.[1] !== undefined) return match[1];
  }
  throw new Error('No reset token found in console.log calls');
}

describe('POST /api/auth/reset', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
    resetRateLimitStore();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  async function requestReset(email: string): Promise<string> {
    const logs: unknown[][] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => logs.push(args);
    try {
      const req = jsonRequest('http://localhost:4310/api/auth/forgot', { origin: VALID_ORIGIN, body: { email } });
      await forgot(req, testDb.db);
    } finally {
      console.log = original;
    }
    return extractTokenFromLog(logs);
  }

  it('resets the password: new password logs in, old one no longer does', async () => {
    const { user } = await createTestUser(testDb.db, { email: 'user@example.com', password: 'the-old-password-1' });
    const token = await requestReset('user@example.com');

    const resetReq = jsonRequest('http://localhost:4310/api/auth/reset', {
      origin: VALID_ORIGIN,
      body: { token, password: 'the-brand-new-password-1' },
    });
    const resetRes = await reset(resetReq, testDb.db);
    expect(resetRes.status).toBe(200);

    const oldLoginReq = jsonRequest('http://localhost:4310/api/auth/login', {
      origin: VALID_ORIGIN,
      body: { email: 'user@example.com', password: 'the-old-password-1' },
    });
    expect((await login(oldLoginReq, testDb.db)).status).toBe(401);

    const newLoginReq = jsonRequest('http://localhost:4310/api/auth/login', {
      origin: VALID_ORIGIN,
      body: { email: 'user@example.com', password: 'the-brand-new-password-1' },
    });
    expect((await login(newLoginReq, testDb.db)).status).toBe(200);
    void user;
  });

  it('deletes every session for the user: a pre-reset cookie is rejected afterward (401)', async () => {
    const { user } = await createTestUser(testDb.db, { email: 'user@example.com', password: 'the-old-password-1' });
    const preResetSession = createSessionForUser(testDb.db, user.id);
    const token = await requestReset('user@example.com');

    const resetReq = jsonRequest('http://localhost:4310/api/auth/reset', {
      origin: VALID_ORIGIN,
      body: { token, password: 'the-brand-new-password-1' },
    });
    expect((await reset(resetReq, testDb.db)).status).toBe(200);

    const row = testDb.sqlite.prepare('SELECT * FROM sessions WHERE id = ?').get(preResetSession.id);
    expect(row).toBeUndefined();
  });

  it('rejects a token that has already been used', async () => {
    await createTestUser(testDb.db, { email: 'user@example.com', password: 'the-old-password-1' });
    const token = await requestReset('user@example.com');

    const first = jsonRequest('http://localhost:4310/api/auth/reset', {
      origin: VALID_ORIGIN,
      body: { token, password: 'the-first-new-password-1' },
    });
    expect((await reset(first, testDb.db)).status).toBe(200);

    const second = jsonRequest('http://localhost:4310/api/auth/reset', {
      origin: VALID_ORIGIN,
      body: { token, password: 'the-second-new-password-1' },
    });
    expect((await reset(second, testDb.db)).status).toBe(400);
  });

  it('rejects an expired token', async () => {
    await createTestUser(testDb.db, { email: 'user@example.com', password: 'the-old-password-1' });
    const token = await requestReset('user@example.com');

    testDb.sqlite.prepare('UPDATE password_reset_tokens SET expires_at = ? WHERE user_id = (SELECT id FROM users WHERE email = ?)').run(
      Date.now() - 1000,
      'user@example.com',
    );

    const req = jsonRequest('http://localhost:4310/api/auth/reset', {
      origin: VALID_ORIGIN,
      body: { token, password: 'the-brand-new-password-1' },
    });
    expect((await reset(req, testDb.db)).status).toBe(400);
  });

  it('rejects an unknown token', async () => {
    const req = jsonRequest('http://localhost:4310/api/auth/reset', {
      origin: VALID_ORIGIN,
      body: { token: 'not-a-real-token', password: 'the-brand-new-password-1' },
    });
    expect((await reset(req, testDb.db)).status).toBe(400);
  });

  it('rejects a new password that violates the password policy', async () => {
    await createTestUser(testDb.db, { email: 'user@example.com', password: 'the-old-password-1' });
    const token = await requestReset('user@example.com');

    const req = jsonRequest('http://localhost:4310/api/auth/reset', {
      origin: VALID_ORIGIN,
      body: { token, password: 'short' },
    });
    expect((await reset(req, testDb.db)).status).toBe(400);
  });

  it('rejects a cross-origin request with 403', async () => {
    await createTestUser(testDb.db, { email: 'user@example.com', password: 'the-old-password-1' });
    const token = await requestReset('user@example.com');

    const req = jsonRequest('http://localhost:4310/api/auth/reset', {
      origin: 'http://evil.example',
      body: { token, password: 'the-brand-new-password-1' },
    });
    expect((await reset(req, testDb.db)).status).toBe(403);
  });
});
