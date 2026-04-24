import type { NextConfig } from "next";

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ['mammoth', 'jsonrepair'],
} as NextConfig & { eslint?: { ignoreDuringBuilds: boolean }; serverExternalPackages?: string[] };

export default nextConfig;
