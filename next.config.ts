import type { NextConfig } from 'next';

// Port is pinned to 4310 per SPEC-001 (Governing Constraints). Next.js has no
// config-level "port" option, so the pin lives in package.json's `dev`/`start`
// scripts (`next dev -p 4310` / `next start -p 4310`), never here and never as
// a default. Do not introduce a custom server to work around that — it is not
// needed. No other port and no container tooling belong in this file
// (see SPEC-001 for the full list of what's off-limits project-wide).
// `/@:handle` and `/@:handle/:slug` (SPEC-007, SPEC-006) can't be literal
// folder names under src/app/**: Next's App Router treats ANY folder
// starting with "@" as a parallel-route slot, unconditionally — and
// empirically (not just per that doc rule), a folder literally named
// `@[handle]` breaks `next build` outright with an internal codegen error
// ("ReferenceError: handle is not defined" while collecting page data), not
// just parallel-route semantics that could be routed around. A `rewrites()`
// entry is the standard fix: the URL stays literally `/@:handle`, the actual
// route folder is a plain `src/app/(profile)/profile/[handle]/`. DEC-056.
//
// Kept as a list (not a single object) on purpose: TASK-026 (Feed & Read)
// appends `{ source: '/@:handle/:slug', destination: '/profile/:handle/:slug' }`
// here for the article page, beside this entry, without restructuring
// anything — do not add that entry from this task; the route it points to
// doesn't exist yet.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/@:handle', destination: '/profile/:handle' }];
  },
};

export default nextConfig;
