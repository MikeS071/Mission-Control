import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

const nextConfig: NextConfig = {
  // Fix Turbopack workspace-root inference (multiple lockfiles on host).
  // Without this, Turbopack may use the wrong root and corrupt its cache.
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/node_modules/**',
          '**/swarm/**',
          '**/.-worktrees/**',
          '**/.git/**',
        ],
      };
    }
    return config;
  },
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        // Prevent Cloudflare / CDNs from caching HTML pages
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

const withMDX = createMDX();
export default withMDX(nextConfig);
