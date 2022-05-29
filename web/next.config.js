const TerserPlugin = require("terser-webpack-plugin");
const path = require("path");
const config = require("../next.config.base");
const { withTM, webpack } = config;

module.exports = withTM({
  webpack: webpack(__dirname),

  experimental: { esmExternals: "loose" },

  // enable SPA mode, disable SSR
  // target: "serverless",
  async rewrites() {
    return [
      // Rewrite everything to `pages/index`
      // {
      //   source: "/:any*",
      //   destination: "/",
      // },

      {
        source: "/posts/:path*",
        destination: `https://posts.grida.co/:path*`,
      },
    ];
  },
});
