import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Browser-driven a11y/behaviour checks for the App Shell (SPEC-009).
 *
 * Wired into `npm run test:e2e`: playwright.config.ts's `testDir`/
 * `testMatch` now cover `tests/a11y/**\/*.spec.ts` as well as
 * `tests/e2e/**\/*.spec.ts` (DEC-010 defect 4, fixed by TASK-004 and now
 * merged onto this branch) — verified live: `npx playwright test
 * tests/a11y/shell.spec.ts` schedules this file's tests instead of
 * reporting "no tests found", so discovery is confirmed working.
 *
 * The "axe-core reports 0 violations of impact serious or critical"
 * acceptance criterion is implemented below via `@axe-core/playwright`
 * (now a devDependency, also landed by TASK-004's DEC-010 fix), scanning
 * each of the 7 routes.
 *
 * DEC-013 (readiness blocker, now fixed elsewhere, not yet landed on this
 * branch): this suite could previously be collected but not executed —
 * playwright.config.ts's `webServer.url` readiness check (`isURLAvailable`
 * in playwright-core/lib/coreBundle.js) only accepts `200 <= statusCode <
 * 404`, and every route in this app currently 404s via
 * src/app/not-found.tsx because no slice has landed any src/app/**\/page.tsx
 * yet — so `next dev -p 4311` never reported "available". The fix
 * (`webServer.port: 4311` instead of `url:`, making readiness a TCP check
 * independent of status code) lives in playwright.config.ts, which is
 * TASK-004's file scope, not this task's — landed there as PROP-381
 * (commit 0c34db88) but not yet merged onto this branch. The coordinator
 * verified with a real run in a scratch worktree combining both commits:
 * the dev server came up and this file's 25 specs executed in 9.3s — the
 * first Playwright execution in this project's history. That run is what
 * surfaced the one real defect this revision fixes (see the focus-visible
 * test below); everything else in the file passed as written.
 *
 * DEC-014 (recorded so it isn't later mistaken for coverage): with
 * readiness fixed, the axe scans below DO execute against all 7 routes and
 * DO return 0 serious/critical violations — but since none of the other
 * slices (feed, article, profile, search, editor, inbox) have landed a
 * page.tsx yet, every route currently resolves to the same
 * src/app/not-found.tsx rendered inside the shell. So this is one page
 * scanned seven times, not seven distinct pages — "executed", not yet
 * "differentiated". That's the accurate current state, not a stand-in
 * written to look passing, and not something fixable from tests/a11y/**:
 * an out-of-scope placeholder page.tsx would risk conflicting with
 * whichever slice owns that route for real. Once those slices land their
 * own pages, this suite still holds unchanged — it only asserts
 * shell-owned structure (skip link, header, main, viewport behaviour, axe
 * scan), never route-specific content — and the scans will start
 * differentiating automatically.
 */

const ROUTES = ['/', '/@ada', '/@ada/some-article', '/tag/some-tag', '/search', '/new', '/inbox'];

test.describe('skip link', () => {
  for (const route of ROUTES) {
    test(`is the first focusable element and moves focus to #main on ${route}`, async ({ page }) => {
      await page.goto(route);
      await page.keyboard.press('Tab');
      const focused = page.locator(':focus');
      await expect(focused).toHaveAttribute('href', '#main');
      await expect(focused).toHaveText('Skip to content');

      await page.keyboard.press('Enter');
      await expect(page.locator('#main')).toBeFocused();
    });
  }
});

test.describe('single main / single h1', () => {
  for (const route of ROUTES) {
    test(`renders exactly one <main id="main"> and one <h1> on ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator('main#main')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveCount(1);
    });
  }
});

test.describe('responsive header at 375px', () => {
  test('collapses search to an icon trigger and causes no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    await expect(page.getByRole('button', { name: 'Search' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search articles' })).toBeHidden();
  });

  test('the mobile search trigger opens a full-width overlay that traps Escape and restores focus', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');

    const trigger = page.getByRole('button', { name: 'Search' });
    await trigger.focus();
    await trigger.press('Enter');

    const overlayInput = page.locator('#shell-search-overlay');
    await expect(overlayInput).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(overlayInput).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe('prefers-reduced-motion', () => {
  test('the skip link reveal has no transition duration when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const skipLink = page.getByRole('link', { name: 'Skip to content' });
    const duration = await skipLink.evaluate((el) => getComputedStyle(el).transitionDuration);
    // "none" or a value effectively 0 (0s / 0.01ms) — never the authored 0.15s.
    expect(duration === 'none' || parseFloat(duration) <= 0.0001).toBe(true);
  });
});

test.describe('focus-visible', () => {
  test('header controls show a visible focus outline on keyboard focus', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Tab'); // wordmark
    const wordmark = page.getByRole('banner').getByRole('link', { name: 'myrio' });
    await expect(wordmark).toBeFocused();
    const outlineWidth = await wordmark.evaluate((el) => getComputedStyle(el).outlineWidth);
    expect(parseFloat(outlineWidth)).toBeGreaterThanOrEqual(2);
  });
});

test.describe('axe accessibility scan', () => {
  for (const route of ROUTES) {
    test(`has 0 serious/critical axe violations on ${route}`, async ({ page }) => {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).analyze();
      const seriousOrCritical = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      expect(seriousOrCritical, JSON.stringify(seriousOrCritical, null, 2)).toEqual([]);
    });
  }
});
