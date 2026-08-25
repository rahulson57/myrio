/**
 * Shared helper for this task's route-handler tests: logs a test user in
 * for real (via the Auth module's own `createSessionForUser`) and returns
 * a `Cookie` header value a `jsonRequest({ cookie })` call can use — the
 * same session-resolution path `requireUser` uses in production, not a
 * stand-in.
 */
import { createSessionForUser } from '../../../../server/auth/session';
import { createTestUser, type TestDb, type TestUser } from '../../../../../tests/auth/test-utils';

export { createMigratedTestDb, type TestDb } from '../../../../../tests/auth/test-utils';
export { jsonRequest, VALID_ORIGIN } from '../../../../../tests/auth/test-utils';

export async function loginTestUser(
  db: TestDb['db'],
  overrides?: Parameters<typeof createTestUser>[1],
): Promise<{ testUser: TestUser; cookie: string }> {
  const testUser = await createTestUser(db, overrides);
  const session = createSessionForUser(db, testUser.user.id);
  return { testUser, cookie: `myrio_session=${encodeURIComponent(session.id)}` };
}
