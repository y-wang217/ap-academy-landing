import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Served at www.apacademy.ca/tracker through the landing app's rewrite
  // (ADR 0002). Every route and asset lives under this prefix.
  basePath: "/tracker",
  transpilePackages: ["@ap-academy/db"],
};

export default nextConfig;
