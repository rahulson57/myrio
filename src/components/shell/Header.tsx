import { AvatarMenu } from './AvatarMenu';
import { BellIcon, InboxIcon, PencilIcon } from './icons';
import { IconBadgeLink } from './IconBadgeLink';
import { SearchSlot } from './SearchSlot';
import type { SessionUser } from './types';
import { Wordmark } from './Wordmark';
import styles from './Header.module.css';

type HeaderProps = {
  user: SessionUser | null;
};

/**
 * The App Shell's only header (SPEC-009): sticky, 64px. Plain <a>/<button>
 * elements throughout rather than next/link — this keeps every shell
 * component renderable and testable standalone (e.g. via
 * react-dom/server's renderToStaticMarkup in tests/a11y/**) without
 * depending on Next's App Router context, and SPEC-009's own accessibility
 * floor only requires a real <a>/<button>, not client-side prefetch.
 *
 * `user` is presentational only — see the ownership note in types.ts. Auth
 * (SPEC-004, not yet built) will pass the real session down from
 * src/app/layout.tsx once it lands; until then layout.tsx passes `null`
 * (signed-out chrome), which is the honest current state rather than a
 * faked session.
 */
export function Header({ user }: HeaderProps) {
  return (
    <header className={styles.header}>
      <Wordmark />

      <div className={styles.searchArea}>
        <SearchSlot />
      </div>

      {user ? (
        <div className={styles.actions}>
          <a href="/new" className={styles.writeLink} aria-label="Write">
            <PencilIcon />
            <span className={styles.writeLabel} aria-hidden="true">
              Write
            </span>
          </a>
          <IconBadgeLink
            href="/inbox"
            label="Notifications"
            count={user.unreadNotifications}
            icon={<BellIcon />}
          />
          <IconBadgeLink href="/inbox" label="Inbox" count={user.unreadMessages} icon={<InboxIcon />} />
          <AvatarMenu user={user} />
        </div>
      ) : (
        <div className={styles.signedOutActions}>
          <a href="/sign-in" className={styles.signInLink}>
            Sign in
          </a>
          <a href="/sign-up" className={styles.getStartedLink}>
            Get started
          </a>
        </div>
      )}
    </header>
  );
}
