/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone output is needed for Docker; Vercel handles its own output format
  ...(process.env.DOCKER_BUILD === "true" && { output: "standalone" }),
  async headers() {
    return [
      {
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, max-age=0",
          },
        ],
      },
      {
        source: "/bills/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=60, stale-while-revalidate=300",
          },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value:
              process.env.NODE_ENV === "production"
                ? "public, max-age=31536000, immutable"
                : "no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/bill-placeholder.svg",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "**.congress.gov" },
      { protocol: "https", hostname: "**.propublica.org" },
    ],
  },
};

export default nextConfig;
