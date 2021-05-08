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
  "@bridged.xyz/flutter-builder",
  "@coli.codes/web-builder",
  "@coli.codes/web-builder-core",
  "@coli.codes/react-builder",
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
