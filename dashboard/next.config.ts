import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Silence lockfile warning in monorepo
  turbopack: {
    root: path.resolve(__dirname),
  },

  headers: async () => [
    {
      // Allow service worker to control the entire origin
      source: "/sw.js",
      headers: [
        {
          key: "Service-Worker-Allowed",
          value: "/",
        },
        {
          key: "Cache-Control",
          value: "no-cache, no-store, must-revalidate",
        },
      ],
    },
    {
      source: "/manifest.json",
      headers: [
        {
          key: "Content-Type",
          value: "application/manifest+json",
        },
      ],
    },
  ],
};

export default nextConfig;
