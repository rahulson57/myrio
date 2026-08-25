import styles from './Wordmark.module.css';

/**
 * The brand wordmark. Links home. Plain <a> rather than next/link — see
 * the note in Header.tsx for why the shell avoids next/link.
 */
export function Wordmark() {
  return (
    <a href="/" className={styles.wordmark}>
      myrio
    </a>
  );
}
