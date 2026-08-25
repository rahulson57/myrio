import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signup } from '../../../src/app/api/auth/signup/handler';
import { getUserByEmail } from '../../../src/server/db/repositories/users';
import { resetRateLimitStore } from '../../../src/server/auth/rate-limit';
import { createMigratedTestDb, jsonRequest, VALID_ORIGIN, extractSessionCookieValue, type TestDb } from '../test-utils';

const VALID_BODY = {
  email: 'new@example.com',
  password: 'a-valid-password-1',
  handle: 'newuser',
  displayName: 'New User',
};

describe('POST /api/auth/signup', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
    resetRateLimitStore();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it('creates a user and logs them in on valid input', async () => {
    const req = jsonRequest('http://localhost:4310/api/auth/signup', { origin: VALID_ORIGIN, body: VALID_BODY });
    const res = await signup(req, testDb.db);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user).toMatchObject({ email: 'new@example.com', handle: 'newuser' });

    const cookieValue = extractSessionCookieValue(res);
    expect(cookieValue).toBeTruthy();

    const row = testDb.sqlite.prepare('SELECT * FROM users WHERE email = ?').get('new@example.com');
    expect(row).toBeDefined();
  });

  it('rejects a password shorter than 10 characters with 400 and creates no user', async () => {
    const req = jsonRequest('http://localhost:4310/api/auth/signup', {
      origin: VALID_ORIGIN,
      body: { ...VALID_BODY, password: 'short1' },
    });
    const res = await signup(req, testDb.db);

    expect(res.status).toBe(400);
    expect(getUserByEmail(testDb.db, 'new@example.com')).toBeUndefined();
    const count = testDb.sqlite.prepare('SELECT COUNT(*) as n FROM users').get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('rejects a password present in common-passwords.txt with 400 and creates no user', async () => {
    const req = jsonRequest('http://localhost:4310/api/auth/signup', {
      origin: VALID_ORIGIN,
      body: { ...VALID_BODY, password: 'password' },
    });
    const res = await signup(req, testDb.db);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fields.password).toBeDefined();
    expect(getUserByEmail(testDb.db, 'new@example.com')).toBeUndefined();
  });

  it('rejects a cross-origin request with 403 and creates no user', async () => {
    const req = jsonRequest('http://localhost:4310/api/auth/signup', {
      origin: 'http://evil.example',
      body: VALID_BODY,
    });
    const res = await signup(req, testDb.db);

    expect(res.status).toBe(403);
    const count = testDb.sqlite.prepare('SELECT COUNT(*) as n FROM users').get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('rejects a duplicate email with a 4xx and creates no second user', async () => {
    const first = jsonRequest('http://localhost:4310/api/auth/signup', { origin: VALID_ORIGIN, body: VALID_BODY });
    await signup(first, testDb.db);

    const second = jsonRequest('http://localhost:4310/api/auth/signup', {
      origin: VALID_ORIGIN,
      body: { ...VALID_BODY, handle: 'someoneelse' },
    });
    const res = await signup(second, testDb.db);

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const count = testDb.sqlite.prepare('SELECT COUNT(*) as n FROM users').get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('rejects an invalid email with 400', async () => {
    const req = jsonRequest('http://localhost:4310/api/auth/signup', {
      origin: VALID_ORIGIN,
      body: { ...VALID_BODY, email: 'not-an-email' },
    });
    const res = await signup(req, testDb.db);
    expect(res.status).toBe(400);
  });

  it('is rate limited at 5 signups per hour per IP', async () => {
    for (let i = 0; i < 5; i++) {
      const req = jsonRequest('http://localhost:4310/api/auth/signup', {
        origin: VALID_ORIGIN,
        body: { ...VALID_BODY, email: `user${i}@example.com`, handle: `user${i}` },
      });
      const res = await signup(req, testDb.db);
      expect(res.status).toBe(201);
    }

    const sixth = jsonRequest('http://localhost:4310/api/auth/signup', {
      origin: VALID_ORIGIN,
      body: { ...VALID_BODY, email: 'user5@example.com', handle: 'user5' },
    });
    const res = await signup(sixth, testDb.db);
    expect(res.status).toBe(429);
  });
});
