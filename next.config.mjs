/** @type {import('next').NextConfig} */
const nextConfig = {
    eslint: { ignoreDuringBuilds: true },
    env: {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      },

};

export default nextConfig;
