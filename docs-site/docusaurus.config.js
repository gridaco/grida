// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const isDev = process.env.NODE_ENV !== "production";
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
  url: isDev ? "http://localhost:3001/" : "https://grida.co/",
  baseUrl: "/docs/",
  onBrokenLinks: "ignore",
  onBrokenMarkdownLinks: "warn",
  favicon: "img/favicon.png",
  organizationName: "gridaco", // Usually your GitHub org/user name.
  projectName: "grida", // Usually your repo name.
  plugins: [
    [
      "@docusaurus/plugin-client-redirects",
      /** @type {import('@docusaurus/plugin-client-redirects').Options} */
      ({
        // add custom client redirects here.
        redirects: [
          {
            from: ["/", "/getting-started"],
            to: "/getting-started/intro",
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
          routeBasePath: "/",
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
      footer: {
        links: [
          {
            title: "Company",
            items: [
              {
                label: "Grida.co",
                to: "https://grida.co",
              },
            ],
          },
          {
            title: "Resources",
            items: [
              {
                label: "Docs",
                to: "/",
              },
              {
                label: "Together",
                to: "/together",
              },
            ],
          },
          {
            title: "Community",
            items: [
              {
                label: "GitHub",
                href: "https://github.com/gridaco/grida",
              },
              {
                label: "Twitter",
                href: "https://twitter.com/grida_co",
              },
              {
                label: "Blog",
                href: "https://blog.grida.co",
              },
              {
                label: "Slack",
                href: "https://grida.co/join-slack",
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Grida Inc.`,
      },
    }),
};

module.exports = config;
