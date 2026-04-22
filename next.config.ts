import type { NextConfig } from "next";

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
} as NextConfig & { eslint?: { ignoreDuringBuilds: boolean } };

export default nextConfig;
