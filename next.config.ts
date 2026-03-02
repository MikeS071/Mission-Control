import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const maybeWorktreesDir = path.dirname(configDir);
const maybeRepoRoot = path.dirname(maybeWorktreesDir);
const isDecapodWorktree = path.basename(maybeWorktreesDir) === ".-worktrees";
const hasRootNextPackage = fs.existsSync(path.join(maybeRepoRoot, "node_modules", "next", "package.json"));
const turbopackRoot = isDecapodWorktree && hasRootNextPackage ? maybeRepoRoot : configDir;

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
    root: turbopackRoot,
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
