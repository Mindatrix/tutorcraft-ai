import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The old tutor dashboard moved into the 3-step Game Studio.
  async redirects() {
    return [{ source: "/tutor", destination: "/tutor/create", permanent: false }];
  },
  // Baseline security headers on every response.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" }, // no embedding the arena in other sites
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
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
