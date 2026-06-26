import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['mammoth', 'jsonrepair'],
  async headers() {
    return [
      {
        source: '/(.*)',
        // X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and
        // X-DNS-Prefetch-Control now live in src/middleware.ts (single source of
        // truth — avoids conflicting duplicate headers). HSTS stays here because
        // the middleware does not set it.
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
