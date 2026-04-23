import type { NextConfig } from "next";

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ['pdf-parse', 'mammoth', 'jsonrepair'],
} as NextConfig & { eslint?: { ignoreDuringBuilds: boolean }; serverExternalPackages?: string[] };

export default nextConfig;
