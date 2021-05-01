const withTM = require("next-transpile-modules")([
  "@designto.codes/core",
  "@bridged.xyz/flutter-builder",
  "@bridged.xyz/design-sdk",
  "@reflect-ui/core",
  "@reflect-ui/detection",
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
