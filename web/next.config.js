const TerserPlugin = require("terser-webpack-plugin");
const path = require("path");
// const withPlugins = require("next-compose-plugins");
// const withImages = require("next-images");
const withTM = require("next-transpile-modules")(
  [
    // app & core
    "@grida.co/app",
    "@app/scene-view",
    "@app/blocks",
    "@app/cms-posts",
    "@core/state",
    "@core/app-state",
    "@core/store",
    "@core/model",

    // utils
    "treearray",

    // boring
    "@boring.so/store",
    "@boring.so/loader",
    "@boring.so/config",
    "@boringso/react-core",
    "@boring.so/document-model",
    "@boring.so/template-provider",

    // region editor-submodule deps
    "@base-sdk-fp/core",
    "@base-sdk-fp/auth",
    "@base-sdk-fp/accounts",
    "@base-sdk-fp/auth-components-react",

    // -----------------------------
    // region @designto-code
    "@designto/config",
    "@grida/builder-config-preset",
    "@grida/builder-platform-types",
    "@designto/code",
    "@designto/sanitized",
    "@designto/token",
    "@designto/flutter",
    "@designto/web",
    "@designto/vanilla",
    "@designto/react",
    "@designto/react-native",

    "@code-features/assets",
    "@code-features/component",
    "@code-features/flags",
    // -----------------------------

    // -----------------------------
    // region @design-sdk
    "@design-sdk/flags",
    "@design-sdk/core",
    "@design-sdk/core-types",
    "@design-sdk/universal",
    "@design-sdk/diff",
    "@design-sdk/figma",
    "@design-sdk/figma-node",
    "@design-sdk/figma-types",
    "@design-sdk/figma-url",
    "@design-sdk/figma-node-conversion",
    "@design-sdk/figma-remote",
    "@design-sdk/figma-remote-api",
    // "@design-sdk/figma-remote-types",
    "@design-sdk/url-analysis",
    "@design-sdk/sketch",
    // -----------------------------

    // -----------------------------
    // region @reflect-ui types & utils
    "@reflect-ui/core",
    "@reflect-ui/detection",
    // -----------------------------

    // -----------------------------
    // base sdk
    "@base-sdk/core",
    "@base-sdk/base",
    "@base-sdk/url",
    "@base-sdk/hosting",
    "@base-sdk/resources",
    "@base-sdk/scene-store",
    // -----------------------------

    // reflect-ui ui framework
    // @editor-ui ui components
    "@editor-ui/editor",
    "@editor-ui/hierarchy",
    "@editor-ui/spacer",
    "@editor-ui/utils",
    "@editor-ui/button",

    // -----------------------------
    // region coli
    "coli",
    "@coli.codes/escape-string",
    "@coli.codes/core-syntax-kind",
    // endregion coli
    // -----------------------------

    // -----------------------------
    // region builders - part of designto-code / coli

    // region web builders
    "@web-builder/nodejs",
    "@web-builder/core",
    "@web-builder/vanilla",
    "@web-builder/react-core",
    "@web-builder/react",
    "@web-builder/react-native",
    "@web-builder/reflect-ui",
    "@web-builder/styled",
    "@web-builder/styles",
    // endregion web builders
    // -----------------------------
  ],
  {
    // resolveSymlinks: true,
    debug: process.env === "development",
  }
);

module.exports = withTM({
  webpack: function (config, { isServer }) {
    // config.module.rules.push({
    //   test: /\.(eot|woff|woff2|ttf|svg|png|jpg|gif)$/,
    //   use: {
    //     loader: "url-loader",
    //     options: {
    //       limit: 100000,
    //       name: "[name].[ext]",
    //     },
    //   },
    // });
    // config.module.rules.push({
    //   test: /\.md$/,
    //   use: "raw-loader",
    // });
    // config.module.rules.push({
    //   test: /\.ts(x?)$/,
    //   use: "babel-loader",
    // });

    // -----------------------------
    // for @flutter-builder classname issue
    config.optimization.minimizer.push(
      new TerserPlugin({
        parallel: true,
        terserOptions: {
          // https://github.com/webpack-contrib/terser-webpack-plugin#terseroptions
          keep_classnames: true,
        },
      })
    );
    // -----------------------------

    config.resolve.fallback = {
      fs: false, // used by handlebars
      path: false, // used by handlebars
      crypto: false, // or crypto-browserify (used for totp auth)
      stream: false, // or stream-browserify (used for totp auth)
    };

    //  https://www.npmjs.com/package/next-transpile-modules#i-have-trouble-with-duplicated-dependencies-or-the-invalid-hook-call-error-in-react
    if (isServer) {
      console.log("server app");
      config.externals = ["react", ...config.externals];
    }
    const reactPath = path.resolve(__dirname, "..", "node_modules", "react");
    console.log("reactPath", reactPath);
    config.resolve.alias["react"] = reactPath;
    //

    return config;
  },

  // enable SPA mode, disable SSR
  target: "serverless",
  async rewrites() {
    return [
      // Rewrite everything to `pages/index`
      // {
      //   source: "/:any*",
      //   destination: "/",
      // },
    ];
  },
});
