// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const darkCodeTheme = require("prism-react-renderer/themes/dracula");
const lightCodeTheme = require("prism-react-renderer/themes/github");

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
          href: "https://grida.co/blog",
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
          srcDark: "img/logo-on-dark.svg",
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
            docId: "reference/intro",
            position: "left",
            label: "Reference",
          },
          {
            href: "https://app.grida.co/sign-in?redirect_uri=https://grida.co/docs",
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
        respectPrefersColorScheme: true,
      },
      algolia: {
        appId: "1ZAWX8WPMC",
        apiKey: "6fa4836dd0147e0ec0425c65c24a3257",
        indexName: "grida-co",
        // contextual search not working for i18n. - learn more - https://github.com/facebook/docusaurus/issues/3396
        // contextualSearch: true,
        searchParameters: {
          facetFilters: ["language:en"],
        },
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
        gtag: {
          trackingID: "G-C4615L9YZK", // same as grida.co
          anonymizeIP: true,
        },
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
