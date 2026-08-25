import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { login } from '../../../src/app/api/auth/login/handler';
import { resetRateLimitStore } from '../../../src/server/auth/rate-limit';
import { createMigratedTestDb, createTestUser, jsonRequest, VALID_ORIGIN, extractSessionCookieValue, type TestDb } from '../test-utils';

describe('POST /api/auth/login', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
    resetRateLimitStore();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('logs in with correct credentials and sets a session cookie', async () => {
    const { user, password } = await createTestUser(testDb.db, { email: 'user@example.com' });

    const req = jsonRequest('http://localhost:4310/api/auth/login', {
      origin: VALID_ORIGIN,
      body: { email: 'user@example.com', password },
    });
    const res = await login(req, testDb.db);

    expect(res.status).toBe(200);
    const cookieValue = extractSessionCookieValue(res);
    expect(cookieValue).toBeTruthy();

    const row = testDb.sqlite.prepare('SELECT * FROM sessions WHERE user_id = ?').get(user.id);
    expect(row).toBeDefined();
  });

  it('wrong password and unknown email return byte-identical bodies and the same 401 status', async () => {
    await createTestUser(testDb.db, { email: 'real@example.com', password: 'the-real-password-1' });

    const wrongPasswordReq = jsonRequest('http://localhost:4310/api/auth/login', {
      origin: VALID_ORIGIN,
      body: { email: 'real@example.com', password: 'totally-wrong-password' },
    });
    const wrongPasswordRes = await login(wrongPasswordReq, testDb.db);

    const unknownEmailReq = jsonRequest('http://localhost:4310/api/auth/login', {
      origin: VALID_ORIGIN,
      body: { email: 'nobody-by-this-email@example.com', password: 'totally-wrong-password' },
    });
    const unknownEmailRes = await login(unknownEmailReq, testDb.db);

    expect(wrongPasswordRes.status).toBe(401);
    expect(unknownEmailRes.status).toBe(401);

    const wrongPasswordText = await wrongPasswordRes.text();
    const unknownEmailText = await unknownEmailRes.text();
    expect(wrongPasswordText).toBe(unknownEmailText);

    expect(extractSessionCookieValue(wrongPasswordRes)).toBeNull();
    expect(extractSessionCookieValue(unknownEmailRes)).toBeNull();
  });

  it('rejects a cross-origin request with 403', async () => {
    const { password } = await createTestUser(testDb.db, { email: 'user@example.com' });
    const req = jsonRequest('http://localhost:4310/api/auth/login', {
      origin: 'http://evil.example',
      body: { email: 'user@example.com', password },
    });
    const res = await login(req, testDb.db);
    expect(res.status).toBe(403);
  });

  it('the 11th login attempt for the same email+IP inside 15 minutes returns 429', async () => {
    await createTestUser(testDb.db, { email: 'user@example.com', password: 'the-real-password-1' });

    for (let i = 0; i < 10; i++) {
      const req = jsonRequest('http://localhost:4310/api/auth/login', {
        origin: VALID_ORIGIN,
        body: { email: 'user@example.com', password: 'wrong-password-attempt' },
      });
      const res = await login(req, testDb.db);
      expect(res.status).toBe(401);
    }

    const eleventh = jsonRequest('http://localhost:4310/api/auth/login', {
      origin: VALID_ORIGIN,
      body: { email: 'user@example.com', password: 'wrong-password-attempt' },
    });
    const res = await login(eleventh, testDb.db);
    expect(res.status).toBe(429);
  });
});
