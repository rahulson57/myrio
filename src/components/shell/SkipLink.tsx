import styles from './SkipLink.module.css';

/**
 * "Skip to content" — must be the first focusable element on every route
 * (SPEC-009). It is rendered as the very first child of <body> in
 * src/app/layout.tsx, before the header. Visually hidden until focused;
 * activating it moves focus to `#main`.
 */
export function SkipLink() {
  return (
    <a href="#main" className={styles.skipLink}>
      Skip to content
    </a>
  );
}
