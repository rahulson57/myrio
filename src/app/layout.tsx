import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Footer } from '../components/shell/Footer';
import { Header } from '../components/shell/Header';
import { SkipLink } from '../components/shell/SkipLink';
import '../styles/tokens.css';

// Relative imports rather than the `@/*` tsconfig path alias throughout
// this task's files: vitest.config.ts (out of this task's file scope) has
// no path-alias resolution wired up, and relative imports let
// tests/a11y/** import these entry points directly under plain `vitest
// run` without needing that config touched. Next itself resolves either
// form identically.

export const metadata: Metadata = {
  title: 'myrio',
  description: 'A place to read and write.',
};

/**
 * The only global chrome (SPEC-009): skip link, sticky header, <main
 * id="main">, footer. Every route mounts into this.
 *
 * `user` is hard-coded to `null` (signed-out chrome) here: Auth & Sessions
 * (SPEC-004) is a separate, not-yet-built slice that owns reading the real
 * session. When it lands, this is the one line that changes — swap `null`
 * for the resolved session — nothing in src/components/shell/** needs to
 * change, since Header already accepts either state. Rendering `null` now
 * is the honest current state, not a guess at what Auth will look like.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SkipLink />
        <Header user={null} />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
