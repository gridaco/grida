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
        async rewrites() {
          return [
            {
              source: "/:path*",
              destination: `/:path*`,
            },
            {
              source: "/docs",
              destination: `${process.env.NEXT_PUBLIC_DOCS_URL}`,
            },
            {
              source: "/docs/:path*",
              destination: `${process.env.NEXT_PUBLIC_DOCS_URL}/:path*`,
            },
          ];
        },
        async redirects() {
          return [
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
              source: "/code",
              destination: "https://code.grida.co",
              permanent: false,
            },
            {
              source: "/console",
              destination: "https://console.grida.co",
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
            {
              source: "/github",
              destination: "https://github.com/gridaco",
              permanent: true,
            },
            {
              source: "/jobs/:path*",
              destination: "/careers/:path*",
              permanent: true,
            },
            {
              source: "/cloud/cors",
              destination: "https://cors.sh",
              permanent: true,
            },
            // events
            {
              source: "/monothon",
              destination: "https://forms.gle/7TfBmiw22rz5SuAS9",
              permanent: false,
            },
          ];
        },
      }),
    ),
  ),
);
