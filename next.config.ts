import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/landing.html',
        destination: '/landing',
      },
    ];
  },
};

export default nextConfig;
