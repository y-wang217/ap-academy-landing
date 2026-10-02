import type { NextConfig } from "next";

/**
 * Landing owns www.apacademy.ca and proxies every other app's path to that
 * app's own deployment (ADR 0002). Read at build time: changing TRACKER_URL
 * needs a landing redeploy. Unset (local dev, or before the tracker exists)
 * means no rewrite, and /tracker is landing's 404.
 */
const TRACKER_URL = process.env.TRACKER_URL?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  transpilePackages: ["@ap-academy/db"],

  async redirects() {
    // A second domain would hold its own host-only session, so send it home.
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "(www\\.)?ap-academy\\.online" }],
        destination: "https://www.apacademy.ca/:path*",
        permanent: true,
      },
    ];
  },

  async rewrites() {
    if (!TRACKER_URL) return [];
    return [
      { source: "/tracker", destination: `${TRACKER_URL}/tracker` },
      { source: "/tracker/:path*", destination: `${TRACKER_URL}/tracker/:path*` },
    ];
  },
};

export default nextConfig;
