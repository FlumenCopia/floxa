import type { NextConfig } from "next";

const BACKEND_HOST = (
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:5000"
)
  .replace(/\/api\/?$/, "")
  .replace(/\/+$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/media/:path*",
        destination: `${BACKEND_HOST}/media/:path*`,
      },
    ];
  },
};

export default nextConfig;
