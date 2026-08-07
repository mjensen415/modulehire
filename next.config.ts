import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['mammoth', 'jsonrepair'],
  async redirects() {
    return [
      // business.modulehire.com → /business/dashboard
      // Catches both bare host and any path the user might land on.
      {
        source: '/',
        has: [{ type: 'host', value: 'business.modulehire.com' }],
        destination: '/business/dashboard',
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        // X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and
        // X-DNS-Prefetch-Control live in src/proxy.ts (single source of
        // truth — avoids conflicting duplicate headers). HSTS stays here because
        // the proxy does not set it.
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
