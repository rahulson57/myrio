import { defineConfig } from 'vitest/config';

// Test command contract (SPEC-001): `npm test` runs `vitest run` and is the
// project's single test command — CI and every task's definition-of-done
// execute exactly that.
export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Business logic coverage floor (SPEC-001): >= 70% lines over
      // src/lib/** and src/server/**, enforced by `vitest --coverage`.
      include: ['src/lib/**', 'src/server/**'],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 70,
      },
    },
  },
});
