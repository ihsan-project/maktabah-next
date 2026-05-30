/** @type {import('next').NextConfig} */
const MCP_FUNCTION_URL =
  process.env.MCP_FUNCTION_URL ||
  'https://us-central1-maktabah-8ac04.cloudfunctions.net/mcpServer';

const nextConfig = {
  experimental: {
    forceSwcTransforms: true,
    outputFileTracingIncludes: {
      '/quran/[surah]': ['./data/quran/**/*'],
      '/quran/[surah]/[verse]': ['./data/quran/**/*'],
      '/sitemap.xml': ['./data/quran/**/*', './data/stories/**/*'],
    },
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
  async headers() {
    return [
      {
        source: '/quran/:surah/:verse',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/story/:name',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/story/:name/:page',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
