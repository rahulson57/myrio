import type { ReactNode } from 'react';
import { Wordmark } from './Wordmark';
import styles from './StatePage.module.css';

type StatePageProps = {
  heading: string;
  message: string;
  action?: ReactNode;
};

/**
 * Shared layout for the branded error/empty states (SPEC-009: "no page may
 * 500 into a blank screen"). Used by src/app/not-found.tsx and
 * src/app/error.tsx so both stay visually and structurally consistent —
 * wordmark, one <h1>, a short message, one primary action — without
 * duplicating markup between the two.
 */
export function StatePage({ heading, message, action }: StatePageProps) {
  return (
    <div className={styles.page}>
      <Wordmark />
      <h1 className={styles.heading}>{heading}</h1>
      <p className={styles.message}>{message}</p>
      {action && <div className={styles.actions}>{action}</div>}
    </div>
  );
}

export { styles as statePageStyles };
