/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: true
  },
  reactStrictMode: false,
  trailingSlash: false,
  async rewrites() {
    return [
      {
        source: '/public/:path*',
        destination: '/:path*'
      }
    ];
  }
};

module.exports = nextConfig;
