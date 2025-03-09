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
  // Exclude API routes from static generation
  trailingSlash: false,
  distDir: '.next',
  
  // This is the key part - exclude API routes from the export
  exportPathMap: async function() {
    return {
      '/': { page: '/' },
      '/auth/login': { page: '/auth/login' },
      '/search': { page: '/search' }
    };
  },
}

module.exports = nextConfig