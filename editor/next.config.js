const IS_DEV = process.env.NODE_ENV === "development";

const packages = [
  // region @editor-app
  "@code-editor/analytics",
  "@code-editor/ui",
  "@editor-app/live-session",
  "@code-editor/preview-pip", // TODO: remove me. this is for development. for production, use npm ver instead.
  "@code-editor/devtools",
  "@code-editor/canvas",
  "@code-editor/property",
  "@code-editor/preferences",
  "@code-editor/dashboard",
  "@code-editor/isolated-inspection",
  "@code-editor/node-icons",
  "@code-editor/canvas-renderer-bitmap",
  // "@code-editor/shortcuts",
  "@code-editor/module-icons",
  "use-sys-theme",

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

const withPlugins = require("next-compose-plugins");
const withTM = require("next-transpile-modules")(packages);

const withPWA = require("next-pwa")({
  register: true,
  dest: "public",
  disable: IS_DEV,
  fallbacks: {
    image: "/images/fallback.png",
    document: "/_offline",
  },
});

module.exports = withPlugins(
  [
    [withTM],
    [
      withPWA,
      {
        pwa: {
          dest: "public",
          // swSrc: "sw.js",
        },
      },
    ],
  ],
  {
    webpack: (config) => {
      config.resolve.fallback = {
        fs: false, // used by handlebars
        path: false, // used by handlebars
      };

      return config;
    },
    async redirects() {
      return [
        {
          // typo gaurd
          source: "/preference",
          destination: "/preferences",
          permanent: true,
        },
        {
          source: "/files/:key/:id",
          destination: "/files/:key?node=:id",
          permanent: false,
        },
      ];
    },
  }
);
