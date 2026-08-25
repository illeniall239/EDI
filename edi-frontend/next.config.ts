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
  experimental: {
    // The proxy below gives up after 30s by default, and a question against a
    // local model can take longer than that -- qwen3:4b answered in 98s on a
    // laptop. What the user saw was "Sorry, I encountered an error" with the
    // backend still working on it, which reads as a broken app rather than a
    // slow model. Ten minutes is past the point where anyone is still waiting.
    proxyTimeout: 600_000,
  },
  // The docs moved to the root when the hosted demo was retired: there is no
  // app to land on any more, so the documentation is the site. These keep the
  // old paths, and anything that already linked to them, working.
  async redirects() {
    return [
      // The hosted site is documentation only: there is no demo behind /app,
      // and an empty spreadsheet asking a visitor for a file they do not have
      // is a worse landing than the docs.
      //
      // Off by default, and deliberately not inferred from process.env.VERCEL:
      // deploying the real app to Vercel is a supported setup that the
      // self-hosting page documents, and guessing would break it. Anyone who
      // clones this repo gets the whole app at /app without setting anything.
      //
      // Temporary, not permanent -- a browser caches a 308 and would keep
      // redirecting long after the variable was unset.
      ...(process.env.EDI_DOCS_ONLY === '1'
        ? [{ source: '/app', destination: '/', permanent: false }]
        : []),
      { source: '/docs', destination: '/', permanent: true },
      // Before the wildcard: the API reference is not at /api. That path
      // belongs to the backend, and a docs page inside the API namespace is a
      // collision waiting for whichever router normalises a trailing slash
      // differently.
      { source: '/docs/api', destination: '/http-api', permanent: true },
      { source: '/docs/:path*', destination: '/:path*', permanent: true },
    ];
  },

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
