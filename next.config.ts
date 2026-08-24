import type { NextConfig } from 'next';

// Port is pinned to 4310 per SPEC-001 (Governing Constraints). Next.js has no
// config-level "port" option, so the pin lives in package.json's `dev`/`start`
// scripts (`next dev -p 4310` / `next start -p 4310`), never here and never as
// a default. Do not introduce a custom server to work around that — it is not
// needed. No other port and no container tooling belong in this file
// (see SPEC-001 for the full list of what's off-limits project-wide).
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
