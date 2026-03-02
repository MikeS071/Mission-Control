import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

function resolveTurbopackRoot(): string {
  let dir = process.cwd();

  // Worktrees may keep node_modules in a parent checkout; find the nearest valid root.
  while (true) {
    if (fs.existsSync(path.join(dir, "node_modules", "next", "package.json"))) {
      return dir;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return process.cwd();
    }
    dir = parent;
  }
}

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
    root: resolveTurbopackRoot(),
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
