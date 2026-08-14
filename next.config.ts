import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "preview-chat-*.space-z.ai",
    "*.space-z.ai",
    "localhost",
    "127.0.0.1",
  ],
};

export default nextConfig;
