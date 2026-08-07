import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  // pools.trade image CDN + our own proxy are the only remote fetchers.
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, s-maxage=10, stale-while-revalidate=30" }],
      },
    ];
  },
};

export default nextConfig;
