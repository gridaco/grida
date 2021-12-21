// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const darkCodeTheme = require("prism-react-renderer/themes/dracula");
const lightCodeTheme = require("prism-react-renderer/themes/github");

const ga_config = {
  trackingID: "G-C4615L9YZK", // same as grida.co
  anonymizeIP: true,
};

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Grida",
  tagline: "Grida documentations",
  url: "https://grida.co/docs/",
  baseUrl: "/",
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",
  favicon: "img/favicon.png",
  organizationName: "gridaco", // Usually your GitHub org/user name.
  projectName: "grida", // Usually your repo name.
  plugins: [
    [
      "@docusaurus/plugin-client-redirects",
      /** @type {import('@docusaurus/plugin-client-redirects').Options} */
      ({
        redirects: [
          {
            from: ["/docs", "/docs/getting-started"],
            to: "/docs/getting-started/intro",
          },
        ],
      }),
    ],
    [
      "@docusaurus/plugin-ideal-image",
      {
        quality: 70,
        max: 1030, // max resized image's size.
        min: 640, // min resized image's size. if original is lower, use that size.
        steps: 2, // the max number of images generated between min and max (inclusive)
      },
    ],
  ],
  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          path: "docs",
          sidebarPath: require.resolve("./sidebars.js"),
          editUrl: "https://github.com/gridaco/grida.co/edit/main/docs/",
          showLastUpdateAuthor: true,
          showLastUpdateTime: true,
        },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
        googleAnalytics: ga_config,
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        logo: {
          alt: "Grida Logo",
          src: "img/logo.svg",
          href: "https://grida.co/",
          target: "_self",
        },
        items: [
          {
            type: "doc",
            docId: "getting-started/intro",
            position: "left",
            label: "Docs",
          },
          // {
          //   type: "doc",
          //   docId: "together/support",
          //   position: "left",
          //   label: "Together",
          // },
          {
            href: "https://github.com/gridaco",
            label: "GitHub",
            position: "right",
          },
        ],
        hideOnScroll: true,
      },
      prism: {
        additionalLanguages: ["dart", "kotlin", "swift"],
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
      },
      colorMode: {
        defaultMode: "light",
        disableSwitch: true,
      },
    }),
};

module.exports = config;
