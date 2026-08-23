import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo root also holds a package.json, and a stale nested .git makes
  // Turbopack guess the wrong workspace root. Pin it to this directory, which
  // is what Vercel builds as the frontend service.
  turbopack: {
    root: __dirname,
  },
  // In production the frontend and backend are two services of one Vercel
  // project behind a single domain, and vercel.json routes /api/* to Python.
  // Locally they are two processes on two ports, which used to mean absolute
  // cross-origin URLs baked into the browser bundle -- and therefore CORS, a
  // localhost-vs-127.0.0.1 origin mismatch, and any relative /api/ call
  // silently hitting Next instead of the backend. Proxying here instead makes
  // development same-origin too, so the client can always use plain /api/*.
  async rewrites() {
    const backend = process.env.BACKEND_ORIGIN;
    if (!backend) return [];
    return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }];
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
