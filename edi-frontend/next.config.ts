import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo root also holds a package.json, and a stale nested .git makes
  // Turbopack guess the wrong workspace root. Pin it to this directory, which
  // is what Vercel builds as the frontend service.
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
        pathname: '/static/visualizations/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '8000',
        pathname: '/static/visualizations/**',
      },
      {
        protocol: 'https',
        hostname: 'www.gravatar.com',
        pathname: '/avatar/**',
      },
    ],
  },
};

export default nextConfig;
