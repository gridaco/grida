const withTM = require("next-transpile-modules")([
  "@designto/code",
  "@designto/token",
  "@designto/flutter",
  "@designto/web",
  "@designto/react",
  "@bridged.xyz/flutter-builder",
  "@design-sdk/core",
  "@design-sdk/universal",
  "@design-sdk/figma",
  "@design-sdk/sketch",
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
