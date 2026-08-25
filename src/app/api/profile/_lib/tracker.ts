/**
 * Process-lifetime singleton `HandleChangeTracker` (see
 * `src/server/services/profiles.ts`'s doc comment for the full DEC-044
 * rationale: an in-process `Map`, not a durable column, because
 * `users.handle_changed_at` was not granted). Every `PATCH /api/profile`
 * request in this process shares one tracker instance — a fresh one per
 * request would make the 30-day cooldown a no-op.
 */

import { createInMemoryHandleChangeTracker, type HandleChangeTracker } from '../../../../server/services/profiles';

let tracker: HandleChangeTracker | undefined;

export function getHandleChangeTracker(): HandleChangeTracker {
  tracker ??= createInMemoryHandleChangeTracker();
  return tracker;
}

/** Test-only: lets each PATCH /api/profile test suite start from a clean tracker. */
export function resetHandleChangeTracker(): void {
  tracker = createInMemoryHandleChangeTracker();
}
