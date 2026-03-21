/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone output is needed for Docker; Vercel handles its own output format
  ...(process.env.DOCKER_BUILD === "true" && { output: "standalone" }),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.congress.gov" },
      { protocol: "https", hostname: "**.propublica.org" },
    ],
  },
};

export default nextConfig;
