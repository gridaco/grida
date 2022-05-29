const TerserPlugin = require("terser-webpack-plugin");
const config = require("../../next.config.base");
const path = require("path");
const { withTM, webpack } = config;

module.exports = withTM({
  webpack: webpack(path.resolve(__dirname, "..")),

  experimental: { esmExternals: "loose" },

  basePath: "/posts",

  async rewrites() {
    return [];
  },
});
