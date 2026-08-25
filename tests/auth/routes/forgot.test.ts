import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgot } from '../../../src/app/api/auth/forgot/handler';
import { resetRateLimitStore } from '../../../src/server/auth/rate-limit';
import { createMigratedTestDb, createTestUser, jsonRequest, VALID_ORIGIN, type TestDb } from '../test-utils';

describe('POST /api/auth/forgot', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
    resetRateLimitStore();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('returns the same generic 200 body for a registered and an unregistered email', async () => {
    await createTestUser(testDb.db, { email: 'real@example.com' });

    const registeredReq = jsonRequest('http://localhost:4310/api/auth/forgot', {
      origin: VALID_ORIGIN,
      body: { email: 'real@example.com' },
    });
    const registeredRes = await forgot(registeredReq, testDb.db);

    const unknownReq = jsonRequest('http://localhost:4310/api/auth/forgot', {
      origin: VALID_ORIGIN,
      body: { email: 'nobody@example.com' },
    });
    const unknownRes = await forgot(unknownReq, testDb.db);

    expect(registeredRes.status).toBe(200);
    expect(unknownRes.status).toBe(200);
    expect(await registeredRes.text()).toBe(await unknownRes.text());
  });

  it('creates a password_reset_tokens row and prints the reset URL for a registered email', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { user } = await createTestUser(testDb.db, { email: 'real@example.com' });

    const req = jsonRequest('http://localhost:4310/api/auth/forgot', {
      origin: VALID_ORIGIN,
      body: { email: 'real@example.com' },
    });
    await forgot(req, testDb.db);

    const row = testDb.sqlite.prepare('SELECT * FROM password_reset_tokens WHERE user_id = ?').get(user.id);
    expect(row).toBeDefined();
    expect(logSpy).toHaveBeenCalled();
    expect(logSpy.mock.calls[0]?.[0]).toContain('/reset-password?token=');

    logSpy.mockRestore();
  });

  it('creates no token row for an unregistered email', async () => {
    const req = jsonRequest('http://localhost:4310/api/auth/forgot', {
      origin: VALID_ORIGIN,
      body: { email: 'nobody@example.com' },
    });
    await forgot(req, testDb.db);

    const count = testDb.sqlite.prepare('SELECT COUNT(*) as n FROM password_reset_tokens').get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('rejects a cross-origin request with 403', async () => {
    const req = jsonRequest('http://localhost:4310/api/auth/forgot', {
      origin: 'http://evil.example',
      body: { email: 'real@example.com' },
    });
    const res = await forgot(req, testDb.db);
    expect(res.status).toBe(403);
  });

  it('is rate limited at 5 per hour per email', async () => {
    await createTestUser(testDb.db, { email: 'real@example.com' });

    for (let i = 0; i < 5; i++) {
      const req = jsonRequest('http://localhost:4310/api/auth/forgot', {
        origin: VALID_ORIGIN,
        body: { email: 'real@example.com' },
      });
      const res = await forgot(req, testDb.db);
      expect(res.status).toBe(200);
    }

    const sixth = jsonRequest('http://localhost:4310/api/auth/forgot', {
      origin: VALID_ORIGIN,
      body: { email: 'real@example.com' },
    });
    const res = await forgot(sixth, testDb.db);
    expect(res.status).toBe(429);
  });
});
