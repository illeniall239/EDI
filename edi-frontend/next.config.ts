import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stale nested .git makes Turbopack guess the wrong workspace root. Pin it
  // to this directory, which is the frontend.
  turbopack: {
    root: __dirname,
  },
  // The client calls plain /api/* and expects to reach the backend on whatever
  // origin it was served from. In a deployment that is a proxy's job. Locally
  // the two halves are separate processes on separate ports, which used to
  // mean absolute cross-origin URLs baked into the browser bundle -- and with
  // them CORS, a localhost-vs-127.0.0.1 origin mismatch, and any relative
  // /api/ call silently hitting Next instead of the backend. Proxying here
  // makes development same-origin too, so there is one code path rather than
  // two.
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
