const withTM = require("next-transpile-modules")([
  "@designto/code",
  "@designto/token",
  "@designto/flutter",
  "@designto/web",
  "@designto/react",
  "@design-sdk/core",
  "@design-sdk/universal",
  "@design-sdk/figma",
  "@design-sdk/sketch",
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
  "@coli.codes/web-builder",
  "@coli.codes/web-builder-core",
  "@coli.codes/nodejs-builder",
  "@coli.codes/react-builder",
  "@web-builder/styled",
  "@web-builder/styles",
  "@bridged.xyz/flutter-builder",
  // endregion coli
]);

const withCSS = require("@zeit/next-css");
module.exports = withTM(
  withCSS({
    webpack: (config) => {
      config.node = {
        fs: "empty",
      };

      return config;
    },
  })
);
