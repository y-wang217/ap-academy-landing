import type { NextConfig } from "next";

// The public site the tracker is served under (through landing's rewrite).
const SITE_HOST = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.apacademy.ca").host;

const nextConfig: NextConfig = {
  // Served at www.apacademy.ca/tracker through the landing app's rewrite
  // (ADR 0002). Every route and asset lives under this prefix.
  basePath: "/tracker",
  transpilePackages: ["@ap-academy/db"],
  experimental: {
    // Server actions reject a request whose Origin differs from the host the
    // app sees. Behind the landing proxy the app may see its own vercel.app
    // host, so the public host is allowed explicitly. Nothing else is.
    serverActions: { allowedOrigins: [SITE_HOST, SITE_HOST.replace(/^www\./, "")] },
  },
};

export default nextConfig;
