import { StatePage, statePageStyles } from '../components/shell/StatePage';

/**
 * Branded 404 (SPEC-009): "no page may 500 into a blank screen" extends to
 * 404 too. Renders inside the root layout (src/app/layout.tsx), which
 * already supplies the header/footer chrome and the single <main id="main">
 * — this component is that main's only content, and it is the page's only
 * <h1>. It also renders its own wordmark + home link directly (rather than
 * relying solely on the header), per this task's acceptance criterion that
 * not-found.tsx itself renders both.
 *
 * Next.js renders this for any unmatched route. Until the other slices
 * (feed, article, profile, search, editor, inbox) land their own
 * src/app/**\/page.tsx files, every route in SPEC-009's 7-route test matrix
 * resolves here — that is the accurate current state of the app, not a
 * stand-in written to look passing.
 */
export default function NotFound() {
  return (
    <StatePage
      heading="Page not found"
      message="The page you're looking for doesn't exist, or may have moved."
      action={
        <a href="/" className={statePageStyles.homeLink}>
          Go home
        </a>
      }
    />
  );
}
