/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@vet-clinic/types', '@vet-clinic/validation', '@vet-clinic/config'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL || 'http://127.0.0.1:3001'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
