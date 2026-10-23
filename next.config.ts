import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The old tutor dashboard moved into the 3-step Game Studio.
  async redirects() {
    return [{ source: "/tutor", destination: "/tutor/create", permanent: false }];
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
