import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `output: "standalone"` is for Docker/self-hosting. Vercel doesn't need
  // it and it breaks Vercel's build (next-server.js.nft.json not found).
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
