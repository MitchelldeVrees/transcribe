/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {

  webpack(config) {
    config.module.rules.push(
      {
        test: /\.wasm$/,
        type: 'asset/resource',
      },
      {
        test: /\.worker\.js$/,
        type: 'asset/resource',
      }
    );
    return config;
  },
  eslint: { ignoreDuringBuilds: true },
  env: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  },
  assetPrefix: isProd ? '/' : '',
};


export default nextConfig;
