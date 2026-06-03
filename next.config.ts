import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['mammoth', 'jsonrepair'],
  // Bundle email-templates/ into Vercel serverless functions so fs.readFileSync
  // works in production. Without this, send-beta-invite silently falls back to
  // the hardcoded inline template (which has a wrong URL).
  outputFileTracingIncludes: {
    '/api/admin/send-beta-invite': ['./email-templates/**/*'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
