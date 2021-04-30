const withTM = require("next-transpile-modules")([
  "@designto.codes/core",
  "@bridged.xyz/flutter-builder",
  "@bridged.xyz/design-sdk",
  "@reflect-ui/core",
  "@reflect-ui/detection",
]);

module.exports = withTM();
