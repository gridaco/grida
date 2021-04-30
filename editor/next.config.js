const withTM = require("next-transpile-modules")([
  "@bridged.xyz/design-sdk",
  "@reflect-ui/core",
]);

module.exports = withTM();
