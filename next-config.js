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
  distDir: '.next',
}

module.exports = nextConfig