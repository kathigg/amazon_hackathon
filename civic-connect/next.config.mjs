/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.congress.gov" },
      { protocol: "https", hostname: "**.propublica.org" },
    ],
  },
};

export default nextConfig;
