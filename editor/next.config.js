const withTM = require("next-transpile-modules")([
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

  "@code-features/assets",
  // -----------------------------

  // -----------------------------
  // region @design-sdk
  "@design-sdk/flags",
  "@design-sdk/core",
  "@design-sdk/core-types",
  "@design-sdk/universal",
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
  "@reflect-ui/editor-ui",

  // -----------------------------
  // region coli
  "coli",
  "@coli.codes/escape-string",
  "@coli.codes/core-syntax-kind",
  // endregion coli
  // -----------------------------

  // -----------------------------
  // region builders - part of designto-code / coli
  // region flutter builder
  "@flutter-builder/flutter",
  // endregion flutter builder

  // region web builders
  "@coli.codes/nodejs-builder",
  "@web-builder/core",
  "@web-builder/vanilla",
  "@web-builder/react",
  "@web-builder/reflect-ui",
  "@web-builder/styled",
  "@web-builder/styles",
  // endregion web builders
  // -----------------------------
]);

const withCSS = require("@zeit/next-css");
module.exports = withTM(
  withCSS({
    webpack: (config) => {
      config.node = {
        fs: "empty",
      };
      config.module.rules.push({
        test: /\.txt$/,
        use: "raw-loader",
      });
      return config;
    },
  })
);
