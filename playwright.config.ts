import { defineConfig, devices } from '@playwright/test';

// Playwright runs the app on its own ephemeral port (4311) per SPEC-001 —
// isolated from the dev/prod port (4310) and never run concurrently with it.
//
// testDir is the repo's tests/ root (not just tests/e2e) so that both the
// critical-journey specs (tests/e2e/**) and the accessibility/axe specs
// (tests/a11y/**, per SPEC-009) run under this project. testMatch is scoped
// explicitly to those two subdirectories and the *.spec.ts extension so
// Vitest's own suites under tests/ (e.g. tests/perf/*.test.ts) are never
// picked up here. (DEC-010 defect 4: testDir was previously './tests/e2e',
// so tests/a11y/** never ran under any command.)
export default defineConfig({
  testDir: './tests',
  testMatch: ['e2e/**/*.spec.ts', 'a11y/**/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4311',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'next dev -p 4311',
    // DEC-013: `url:` readiness only accepts 2xx/3xx responses, but until a
    // page-owning slice lands a src/app/page.tsx, every route 404s through
    // not-found.tsx — so a URL-based check never reports "ready" and the
    // whole suite (tests/e2e/** and tests/a11y/**) times out before running.
    // `port:` makes readiness a plain TCP-accept check instead, independent
    // of what status code the app returns once it does.
    port: 4311,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
