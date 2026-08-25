import { defineConfig } from 'vitest/config';

// Test command contract (SPEC-001): `npm test` runs `vitest run` and is the
// project's single test command — CI and every task's definition-of-done
// execute exactly that.
export default defineConfig({
  // Vite 8 (pulled in by Vitest 4) transforms .ts/.tsx with its newer oxc
  // pipeline by default, which ignores `esbuild.jsx` entirely. Force it back
  // to the esbuild transform so the `esbuild.jsx` override below actually
  // takes effect — oxc has no equivalent "automatic JSX runtime" option
  // exposed at this Vite version.
  oxc: false,
  // Vitest's esbuild transform needs an explicit JSX mode to compile .tsx
  // test files and any component they import. tsconfig.json's
  // compilerOptions.jsx stays "preserve" — Next.js's own build pipeline
  // requires that — this override only affects the Vitest transform.
  // (DEC-010 defect 1: without this, importing any .tsx dies at transform
  // with "make sure to not set jsx to preserve".)
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    passWithNoTests: true,
    // Coverage is a root-level (not per-project) option.
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
    // Split into two projects so plain .test.ts unit/integration suites
    // (e.g. the Data Layer's, which touch the real better-sqlite3 native
    // binding) keep running under 'node' — no DOM, no jsdom overhead — while
    // .test.tsx component tests get a real DOM to render into via 'jsdom'.
    // (`environmentMatchGlobs` was the pre-Vitest-4 way to do this; it no
    // longer exists in this installed version — `projects` is the current
    // supported mechanism, each one `extends: true` from this root config
    // so the oxc/esbuild/coverage settings above still apply to both.)
    // (DEC-010 defect 2: environment:'node' left no DOM for anything to
    // render into. DEC-010 defect 3: the prior single include list matched
    // only .test.ts, so no .test.tsx file was ever collected.)
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'component',
          environment: 'jsdom',
          include: ['tests/**/*.test.tsx', 'src/**/*.test.tsx'],
        },
      },
    ],
  },
});
