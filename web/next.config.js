const TerserPlugin = require("terser-webpack-plugin");
const path = require("path");
const config = require("../next.config.base");
const { withTM, webpack } = config;
const { APP_CMS_POSTS_URL } = process.env;
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
        source: "/:path*",
        destination: `/:path*`,
      },
      {
        source: "/posts/",
        destination: `${APP_CMS_POSTS_URL}/posts/`,
      },
      {
        source: "/posts/:path*",
        destination: `${APP_CMS_POSTS_URL}/posts/:path*`,
      },
    ];
  },
});
