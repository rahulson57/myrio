import type { ReactNode } from 'react';
import styles from './IconBadgeLink.module.css';

type IconBadgeLinkProps = {
  href: string;
  label: string;
  count: number;
  icon: ReactNode;
};

/**
 * An icon control with an unread-count badge (the bell and the inbox icon).
 * The badge count is announced on change via `aria-live="polite"` on the
 * accessible name itself (SPEC-009's live-region requirement) rather than a
 * separate visually-hidden live region, so assistive tech reads "Inbox, 3
 * unread" whenever the count updates.
 *
 * Presentational only: this renders the shell's link/badge, not the
 * notification/message dropdown panel — that panel is Inbox's (SPEC-008,
 * out of scope here).
 */
export function IconBadgeLink({ href, label, count, icon }: IconBadgeLinkProps) {
  const accessibleName = count > 0 ? `${label}, ${count} unread` : label;

  return (
    <span className={styles.wrapper}>
      <a href={href} className={styles.link} aria-label={accessibleName} aria-live="polite">
        {icon}
      </a>
      {count > 0 && (
        <span className={styles.badge} aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </span>
  );
}
