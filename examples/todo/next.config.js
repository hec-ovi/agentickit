/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile the workspace package so Next's bundler resolves its ESM exports
  // cleanly without hitting the dist/.cjs fallback.
  transpilePackages: ["agentickit"],
};

module.exports = nextConfig;
