const packages = [
  // boring
  "@boring.so/store",
  "@boring.so/loader",
  "@boring.so/config",
  "@boringso/react-core",
  "@boring.so/document-model",
  "@boring.so/template-provider",
];

/**
 * @type {import('next').NextConfig}
 */
const config = {
  experimental: { esmExternals: "loose" },
  basePath: "/posts",
  transpilePackages: packages,
};

module.exports = config;
