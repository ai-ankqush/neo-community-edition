import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Methodology and prompts are server-side only. Nothing in /src/server
  // may be imported by client components - enforced by 'server-only' imports.
  experimental: {},
  // Don't fail a production build (Docker / self-host) on lint findings — lint is
  // a dev/CI concern, not a deploy blocker. Type errors still fail the build.
  eslint: { ignoreDuringBuilds: true },
  // The public product tour moved from /demo to /tour. Keep old links alive.
  async redirects() {
    return [
      { source: "/demo", destination: "/tour", permanent: true },
      { source: "/demo/:path*", destination: "/tour/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
