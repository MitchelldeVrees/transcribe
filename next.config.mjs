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
    GROK_API_KEY: process.env.GROK_API_KEY,
    GROK_BASE_URL: process.env.GROK_BASE_URL,
    AZURE_FUNCTION_URL: process.env.AZURE_FUNCTION_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    CF_API_TOKEN: process.env.CF_API_TOKEN,
    TURSO_URL: process.env.TURSO_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
  },
  assetPrefix: isProd ? '/' : '',
};


export default nextConfig;
