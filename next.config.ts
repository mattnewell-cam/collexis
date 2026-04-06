import type { NextConfig } from "next";

const documentBackendUrl = "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // Playwright is a native Node module — prevent Next.js from bundling it
  serverExternalPackages: ['playwright', 'playwright-core'],

  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/backend/:path*',
          destination: `${documentBackendUrl}/:path*`,
        },
        {
          source: '/api/backend/:path*',
          destination: `${documentBackendUrl}/:path*`,
        },
        {
          source: '/',
          has: [{ type: 'host', value: 'console\\.collexis\\.uk' }],
          destination: '/console',
        },
        {
          source: '/:path+',
          has: [{ type: 'host', value: 'console\\.collexis\\.uk' }],
          destination: '/console/:path+',
        },
      ],
    };
  },
};

export default nextConfig;
