/** @type {import('next').NextConfig} */
const MCP_FUNCTION_URL =
  process.env.MCP_FUNCTION_URL ||
  'https://us-central1-maktabah-8ac04.cloudfunctions.net/mcpServer';

const nextConfig = {
  experimental: {
    forceSwcTransforms: true,
  },
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/mcp',
        destination: MCP_FUNCTION_URL,
      },
      {
        source: '/mcp/:path*',
        destination: `${MCP_FUNCTION_URL}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
