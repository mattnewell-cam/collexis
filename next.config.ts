import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/:path*',
          has: [{ type: 'host', value: 'console.collexis.uk' }],
          destination: '/console/:path*',
        },
      ],
    };
  },
};

export default nextConfig;
