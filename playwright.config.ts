import { defineConfig, devices } from '@playwright/test';

// Playwright runs the app on its own ephemeral port (4311) per SPEC-001 —
// isolated from the dev/prod port (4310) and never run concurrently with it.
export default defineConfig({
  testDir: './tests/e2e',
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
    url: 'http://localhost:4311',
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
