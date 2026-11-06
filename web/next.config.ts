import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // lib/store.ts reads ../data at runtime; trace from the repo root so Vercel bundles those files
  outputFileTracingRoot: path.join(__dirname, ".."),
  outputFileTracingIncludes: {
    "/api/**": ["../data/synthetic_*.json"],
  },
};

export default nextConfig;
