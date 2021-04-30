const withTM = require("next-transpile-modules")([
  "@designto.codes/core",
  "@bridged.xyz/design-sdk",
  "@reflect-ui/core",
]);

module.exports = withTM();
