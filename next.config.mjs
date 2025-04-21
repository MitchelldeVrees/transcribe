/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  env: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  },
  assetPrefix: isProd ? '/' : '',
};

export default nextConfig;
