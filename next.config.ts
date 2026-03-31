import type { NextConfig } from "next";

const documentBackendUrl = process.env.DOCUMENT_BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
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
