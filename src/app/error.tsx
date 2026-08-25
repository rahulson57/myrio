'use client';

import { useEffect } from 'react';
import { StatePage, statePageStyles } from '../components/shell/StatePage';

/**
 * Branded 500 (SPEC-009): never leaks a stack trace to the DOM in
 * production. Deliberately does not render `error.message` or
 * `error.stack` anywhere in the tree — only a fixed, generic message — so
 * there is nothing implementation-specific for a forced error to leak
 * through this component, in dev or in production. The error is still
 * logged to the console (standard Next.js pattern for wiring up real
 * error reporting later) but a console entry is not DOM content.
 *
 * Next's App Router requires app/error.tsx to be a Client Component and
 * renders it inside an error boundary nested under the root layout, so the
 * header/footer/skip-link from src/app/layout.tsx stay mounted; this
 * component supplies the wordmark + home link itself too, per this task's
 * acceptance criterion that error.tsx renders both directly.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatePage
      heading="Something went wrong"
      message="An unexpected error occurred. You can try again, or head back home."
      action={
        <>
          <button type="button" className={statePageStyles.retryButton} onClick={reset}>
            Try again
          </button>
          <a href="/" className={statePageStyles.homeLink}>
            Go home
          </a>
        </>
      }
    />
  );
}
