// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const darkCodeTheme = require("prism-react-renderer/themes/dracula");
const lightCodeTheme = require("prism-react-renderer/themes/github");
const ga_config = {
  trackingID: "G-C4615L9YZK", // same as grida.co
  anonymizeIP: true,
};

const footer = {
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
};

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Grida",
  tagline: "Grida documentations",
  url: "https://grida.co",
  baseUrl: "/docs/",
  favicon: "img/favicon.png",
  organizationName: "gridaco", // Usually your GitHub org/user name.
  projectName: "grida", // Usually your repo name.
  onBrokenLinks: "ignore",
  onBrokenMarkdownLinks: "warn",
  i18n: {
    defaultLocale: "en",
    locales: [
      "en",
      // "fr",
      "ko",
    ],
  },
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
            docId: "intro",
            position: "left",
            label: "Docs",
          },
          {
            type: "doc",
            docId: "flags/intro",
            position: "left",
            label: "Flags",
          },
          {
            type: "doc",
            docId: "references/intro",
            position: "left",
            label: "Reference",
          },
          {
            type: "doc",
            docId: "together/support",
            position: "left",
            label: "Together",
          },
          {
            href:
              "https://accounts.grida.co/signin?redirect_uri=https://grida.co/docs",
            position: "left",
            label: "Sign in",
          },
          {
            type: "localeDropdown",
            position: "right",
          },
          {
            href: "https://github.com/gridaco",
            className: "navbar-item-github",
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
      footer: footer,
    }),
  presets: [
    [
      "@docusaurus/preset-classic",
      {
        docs: {
          routeBasePath: "/",
          path: "docs",
          sidebarPath: require.resolve("./sidebars.js"),
          editUrl: "https://github.com/gridaco/grida.co/edit/main/docs/",
        },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
        googleAnalytics: ga_config,
      },
    ],
  ],
  plugins: [
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
};

module.exports = config;
