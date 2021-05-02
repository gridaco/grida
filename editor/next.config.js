const withTM = require("next-transpile-modules")([
  "@designto/code",
  "@designto/token",
  "@designto/flutter",
  "@designto/react",
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
