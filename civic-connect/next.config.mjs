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
            value: "public, s-maxage=60, stale-while-revalidate=300",
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
