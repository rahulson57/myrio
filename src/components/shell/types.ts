/**
 * Shared shell types.
 *
 * `SessionUser` is a minimal, presentational shape — just enough for the
 * header to switch between its signed-in and signed-out chrome. Auth &
 * Sessions (SPEC-004) is a separate, not-yet-built slice; when it lands it
 * wires the real session into `src/app/layout.tsx` and passes it down as
 * this same shape. Nothing in src/components/shell/** talks to a session
 * store, a cookie, or an API directly — it only renders whatever is handed
 * to it.
 */
export type SessionUser = {
  handle: string;
  displayName: string;
  avatarSrc: string | null;
  unreadNotifications: number;
  unreadMessages: number;
};
