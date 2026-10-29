import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/parcel/san-diego/[slug]": [
      "./data/san-diego-public-zoning-snapshot-v0/manifest.json",
      "./data/san-diego-public-zoning-snapshot-v0/shards/*.ndjson.gz",
    ],
    "/api/private/san-diego-feasibility-pilot": [
      "./data/san-diego-property-intelligence-runtime-v0/manifest.json",
      "./data/san-diego-property-intelligence-runtime-v0/shards/*.ndjson.gz",
    ],
  },
};

export default nextConfig;
