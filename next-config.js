/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    forceSwcTransforms: true,
  },
  reactStrictMode: true,
  output: 'export', // Export static site for Firebase hosting
  images: {
    unoptimized: true, // For static export
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Add proper headers for Firebase hosting
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  // Exclude API routes from static generation
  trailingSlash: false,
  distDir: '.next',
  // Exclude /api routes from static export
  exportPathMap: async function (defaultPathMap) {
    // Filter out API routes
    const filteredPaths = {};
    for (const [path, config] of Object.entries(defaultPathMap)) {
      if (!path.startsWith('/api')) {
        filteredPaths[path] = config;
      }
    }
    return filteredPaths;
  },
}

module.exports = nextConfig