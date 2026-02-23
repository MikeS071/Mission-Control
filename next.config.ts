import type { NextConfig } from "next";
import { createMDX } from 'fumadocs-mdx/next';

const nextConfig: NextConfig = {
  turbopack: {
    // Ensure Turbopack treats this repo as the workspace root even if other lockfiles exist.
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
