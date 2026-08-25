import styles from './Footer.module.css';

/**
 * Global footer: static links + seed-corpus attribution (SPEC-009). Kept
 * minimal — per-article provenance (work/author/licence) is rendered on
 * the article page itself by the Feed & Read section (SPEC-006); this is
 * just the site-wide note pointing at that.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <span>&copy; {year} myrio</span>
      <span>Article text drawn from a public-domain corpus — attribution on each article.</span>
      <nav className={styles.links} aria-label="Footer">
        <a href="/">Home</a>
      </nav>
    </footer>
  );
}
