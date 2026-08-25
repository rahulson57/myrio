import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSession, requireUser, requireOwner, requireSameOrigin, HttpError } from '../../src/server/auth/guard';
import { createSessionForUser, serializeSessionCookie } from '../../src/server/auth/session';
import { createMigratedTestDb, createTestUser, jsonRequest, type TestDb } from './test-utils';

describe('guard', () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createMigratedTestDb();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe('getSession', () => {
    it('returns null when there is no cookie header', async () => {
      const req = new Request('http://localhost:4310/api/whatever');
      await expect(getSession(req, testDb.db)).resolves.toBeNull();
    });

    it('returns null for an unknown session id', async () => {
      const req = jsonRequest('http://localhost:4310/api/whatever', {
        cookie: 'myrio_session=not-a-real-session',
      });
      await expect(getSession(req, testDb.db)).resolves.toBeNull();
    });

    it('resolves a valid session to {userId, sessionId}', async () => {
      const { user } = await createTestUser(testDb.db);
      const session = createSessionForUser(testDb.db, user.id);
      const req = jsonRequest('http://localhost:4310/api/whatever', {
        cookie: serializeSessionCookie(session.id).split(';')[0],
      });

      await expect(getSession(req, testDb.db)).resolves.toEqual({
        userId: user.id,
        sessionId: session.id,
      });
    });

    it('a session whose expires_at is in the past is rejected and its row is deleted', async () => {
      const { user } = await createTestUser(testDb.db);
      const session = createSessionForUser(testDb.db, user.id);
      // Force it into the past.
      testDb.sqlite.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, session.id);

      const req = jsonRequest('http://localhost:4310/api/whatever', {
        cookie: `myrio_session=${session.id}`,
      });
      await expect(getSession(req, testDb.db)).resolves.toBeNull();

      const row = testDb.sqlite.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
      expect(row).toBeUndefined();
    });
  });

  describe('requireUser', () => {
    it('throws HttpError(401) when there is no valid session', async () => {
      const req = new Request('http://localhost:4310/api/whatever');
      await expect(requireUser(req, testDb.db)).rejects.toMatchObject({ status: 401 });
      await expect(requireUser(req, testDb.db)).rejects.toBeInstanceOf(HttpError);
    });

    it('resolves with the session for a valid cookie', async () => {
      const { user } = await createTestUser(testDb.db);
      const session = createSessionForUser(testDb.db, user.id);
      const req = jsonRequest('http://localhost:4310/api/whatever', {
        cookie: `myrio_session=${session.id}`,
      });

      await expect(requireUser(req, testDb.db)).resolves.toEqual({ userId: user.id, sessionId: session.id });
    });
  });

  describe('requireOwner', () => {
    it('throws HttpError(403) when the session does not own the resource', () => {
      const session = { userId: 'user-a', sessionId: 'sess-a' };
      expect(() => requireOwner(session, 'user-b')).toThrow(HttpError);
      try {
        requireOwner(session, 'user-b');
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        expect((err as HttpError).status).toBe(403);
      }
    });

    it('does not throw when the session owns the resource', () => {
      const session = { userId: 'user-a', sessionId: 'sess-a' };
      expect(() => requireOwner(session, 'user-a')).not.toThrow();
    });
  });

  describe('requireSameOrigin', () => {
    it('does not throw when Origin is absent', () => {
      const req = new Request('http://localhost:4310/api/auth/logout', { method: 'POST' });
      expect(() => requireSameOrigin(req)).not.toThrow();
    });

    it('does not throw when Origin is http://localhost:4310', () => {
      const req = jsonRequest('http://localhost:4310/api/auth/logout', { origin: 'http://localhost:4310' });
      expect(() => requireSameOrigin(req)).not.toThrow();
    });

    it('throws HttpError(403) for a cross-site Origin', () => {
      const req = jsonRequest('http://localhost:4310/api/auth/logout', { origin: 'http://evil.example' });
      expect(() => requireSameOrigin(req)).toThrow(HttpError);
      try {
        requireSameOrigin(req);
        expect.unreachable();
      } catch (err) {
        expect((err as HttpError).status).toBe(403);
      }
    });
  });
});
