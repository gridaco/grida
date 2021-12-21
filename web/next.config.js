const { DOCS_URL } = process.env;

const withMDX = require("@next/mdx")({
  extension: /\.mdx?$/,
});
const withBundleAnalyzer = require("@zeit/next-bundle-analyzer");
const withTM = require("next-transpile-modules");
const withVideos = require("next-videos");

module.exports = withBundleAnalyzer(
  withVideos(
    withMDX(
      withTM({
        pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"],
        webpack: function(config, { isServer }) {
          config.module.rules.push({
            test: /\.(eot|woff|woff2|ttf|svg|png|jpg|gif)$/,
            use: {
              loader: "url-loader",
              options: {
                limit: 100000,
                name: "[name].[ext]",
              },
            },
          });
          config.module.rules.push({
            test: /\.md$/,
            use: "raw-loader",
          });
          // config.plugins.push(new CompressionPlugin());
          if (!isServer) {
            config.node = {
              fs: "empty",
            };
          }
          return config;
        },
        transpileModules: ["lodash-es"],
        images: {
          domains: ["img.youtube.com", "via.placeholder.com"],
        },
        analyzeServer: ["server", "both"].includes(process.env.BUNDLE_ANALYZE),
        analyzeBrowser: ["browser", "both"].includes(
          process.env.BUNDLE_ANALYZE,
        ),
        bundleAnalyzerConfig: {
          server: {
            analyzerMode: "static",
            reportFilename: "../../bundles/server.html",
          },
          browser: {
            analyzerMode: "static",
            reportFilename: "../bundles/client.html",
          },
        },
        async redirects() {
          return [
            // region docs
            {
              source: "/docs",
              permanent: true,
              destination: `${DOCS_URL}/docs`,
            },
            {
              source: "/docs/:path*",
              permanent: true,
              destination: `${DOCS_URL}/docs/:path*`,
            },
            // endregion docs
            // disabling globalization page access since it's not fully implemented. (temporary)
            {
              source: "/globalization",
              destination: "/",
              permanent: false,
            },
            // redirecting docs to docs/getting-started since docs main page is not yet implemented.
            {
              source: "/assistant",
              destination:
                "https://www.figma.com/community/plugin/896445082033423994",
              permanent: false,
            },
            {
              source: "/vscode",
              destination:
                "https://marketplace.visualstudio.com/items?itemName=grida.grida-vscode",
              permanent: false,
            },
            {
              source: "/join-slack",
              destination:
                "https://join.slack.com/t/gridaco/shared_invite/zt-nmf59381-prFEqq032K~aWe_zOekUmQ",
              permanent: true,
            },
          ];
        },
      }),
    ),
  ),
);
