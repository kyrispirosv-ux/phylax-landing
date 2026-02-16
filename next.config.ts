import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async redirects() {
    return [
      {
        source: '/landing.html',
        destination: '/',
        permanent: false, // Temporary redirect to bypass cache
      },
      {
        source: '/landing',
        destination: '/',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
