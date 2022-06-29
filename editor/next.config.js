const TerserPlugin = require("terser-webpack-plugin");
const withTM = require("next-transpile-modules")([
  // region @editor-app
  "@editor-app/live-session",
  "@code-editor/preview-pip", // TODO: remove me. this is for development. for production, use npm ver instead.
  "@code-editor/devtools",
  "@code-editor/canvas",

  // region editor-submodule deps
  "@base-sdk-fp/auth",
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
  "@designto/solid-js",
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
  "@web-builder/module-es",
  "@web-builder/module-jsx",
  "@web-builder/solid-js",
  "@web-builder/vanilla",
  "@web-builder/react-core",
  "@web-builder/react",
  "@web-builder/react-native",
  "@web-builder/reflect-ui",
  "@web-builder/styled",
  "@web-builder/styles",
  // endregion web builders
  // -----------------------------
]);

module.exports = withTM({
  webpack: (config) => {
    config.module.rules.push({
      type: "javascript/auto",
      test: /\.mjs$/,
      include: /node_modules/,
    });

    config.resolve.fallback = {
      fs: false, // used by handlebars
      path: false, // used by handlebars
      crypto: false, // or crypto-browserify (used for totp auth)
      stream: false, // or stream-browserify (used for totp auth)
    };

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

    return config;
  },
  async redirects() {
    return [
      {
        // typo gaurd
        source: "/preference",
        destination: "/preferences",
        permanent: true,
      },
      {
        source: "/files/:key/:id",
        destination: "/files/:key?node=:id",
        permanent: false,
      },
    ];
  },
});
