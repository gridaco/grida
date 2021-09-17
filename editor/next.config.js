const withTM = require("next-transpile-modules")([
  "@designto/config",
  "@grida/builder-config-preset",
  "@grida/builder-platform-types",
  "@designto/code",
  "@designto/sanitized",
  "@designto/token",
  "@designto/flutter",
  "@designto/web",
  "@designto/react",

  "@code-features/assets",

  // design-sdk
  "@design-sdk/key-annotations",
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
  // reflect-ui
  "@reflect-ui/core",
  "@reflect-ui/detection",

  // base sdk
  "@base-sdk/core",
  "@base-sdk/base",
  "@base-sdk/url",
  "@base-sdk/hosting",
  "@base-sdk/resources",

  // reflect-ui
  "@reflect-ui/editor-ui",

  // region coli
  "coli",
  "@coli.codes/escape-string",
  "@coli.codes/core-syntax-kind",
  // endregion coli

  // region flutter builder
  "@bridged.xyz/flutter-builder",
  // endregion flutter builder

  // region web builders
  "@coli.codes/nodejs-builder",
  "@web-builder/core",
  "@web-builder/react",
  "@web-builder/reflect-ui",
  "@web-builder/styled",
  "@web-builder/styles",
  // endregion web builders
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
