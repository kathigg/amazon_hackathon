/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.congress.gov" },
      { protocol: "https", hostname: "**.propublica.org" },
    ],
  },
};

export default nextConfig;
