import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // lib/store.ts reads ../data at runtime; trace from the repo root so Vercel bundles those files
  outputFileTracingRoot: path.join(__dirname, ".."),
  outputFileTracingIncludes: {
    "/api/**": ["../data/synthetic_db.json", "../data/synthetic_tracker_definition.json"],
  },
};

export default nextConfig;
