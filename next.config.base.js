const codepkgs = [
  "@engine/core",

  // -----------------------------
  // region @designto-code
  "@designto/debugger",
  "@grida/builder-config",
  "@grida/builder-config-preset",
  "@grida/builder-platform-types",
  "@designto/code",
  "@designto/sanitized",
  "@designto/token",
  "@designto/flutter",
  "@designto/solid-js",
  "@designto/web",
  "@designto/vanilla",
  "@designto/react",
  "@designto/react-native",

  "@code-features/assets",
  "@code-features/module",
  "@code-features/documentation",
  "@code-features/component",
  "@code-features/flags",
  "@code-features/fonts",
  // -----------------------------
  // plugins
  "@code-plugin/core",
  "@code-plugin/text-fit",
  // -----------------------------

  // reflect-ui ui framework
  // @editor-ui ui components
  "@editor-ui/editor",
  "@editor-ui/hierarchy",
  "@editor-ui/spacer",
  "@editor-ui/utils",
  "@editor-ui/button",

  // -----------------------------
  // region builders - part of designto-code / coli

  // region web builders
  "@web-builder/nodejs",
  "@web-builder/core",
  "@web-builder/module-es",
  "@web-builder/module-jsx",
  "@web-builder/solid-js",
  "@web-builder/vanilla",
  "@web-builder/react-core",
  "@web-builder/react",
  "@web-builder/react-native",
  "@web-builder/reflect-ui",
  "@web-builder/styled",
  "@web-builder/styles",
  // endregion web builders
  // -----------------------------
];

const path = require("path");
const withTM = require("next-transpile-modules")(
  [
    ...codepkgs,

    // appp
    "@grida.co/app",
    "@app/scene-view",
    "@app/blocks",
    "@app/cms-posts",
    "@app/fp-customer-support",
    "@core/state",
    "@core/app-state",
    "@core/store",
    "@core/model",

    // ui
    "@ui/tags-input",
    "@ui/date-picker",

    // https://github.com/vercel/next.js/discussions/13553#discussioncomment-20092  ----------------------------
    // cause of this, we also set `experimental: { esmExternals: "loose" }`
    "react-tag-input",
    "react-dnd",
    "dnd-core",
    "@react-dnd/invariant",
    "@react-dnd/asap",
    "@react-dnd/shallowequal",
    //  --------------------------------------------------------------------------------------------------------

    // utils
    "treearray",

    // boring
    "@boring.so/store",
    "@boring.so/loader",
    "@boring.so/config",
    "@boringso/react-core",
    "@boring.so/document-model",
    "@boring.so/template-provider",
  ],
  {
    // resolveSymlinks: true,
    debug: process.env === "development",
  }
);

const TerserPlugin = require("terser-webpack-plugin");
const webpack =
  (__dirname) =>
  (config, { isServer }) => {
    // -----------------------------
    // for @flutter-builder classname issue
    config.optimization.minimizer.push(
      new TerserPlugin({
        parallel: true,
        terserOptions: {
          // https://github.com/webpack-contrib/terser-webpack-plugin#terseroptions
          keep_classnames: true,
        },
      })
    );
    // -----------------------------

    config.resolve.fallback = {
      net: false,
      tls: false,
      child_process: false,
      fs: false, // used by handlebars
      path: false, // used by handlebars
      crypto: false, // or crypto-browserify (used for totp auth)
      stream: false, // or stream-browserify (used for totp auth)
    };

    //  https://www.npmjs.com/package/next-transpile-modules#i-have-trouble-with-duplicated-dependencies-or-the-invalid-hook-call-error-in-react
    if (isServer) {
      console.log("server app");
      config.externals = ["react", ...config.externals];
    }
    const reactPath = path.resolve(__dirname, "..", "node_modules", "react");
    console.log("reactPath", reactPath);
    config.resolve.alias["react"] = reactPath;
    //

    return config;
  };

module.exports = {
  withTM,
  webpack,
};
