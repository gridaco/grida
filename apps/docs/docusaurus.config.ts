import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

const footer = {
  links: [
    {
      title: "Company",
      items: [
        {
          label: "Grida",
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

const config: Config = {
  title: "Grida",
  tagline: "Grida documentations",
  url: "https://grida.co",
  baseUrl: "/docs/",
  favicon: "img/favicon.png",
  organizationName: "gridaco",
  projectName: "grida",
  onBrokenLinks: "ignore",
  onBrokenMarkdownLinks: "warn",
  stylesheets: [require.resolve("katex/dist/katex.min.css")],
  i18n: {
    defaultLocale: "en",
    locales: [
      "en",
      // "fr",
      "ko",
    ],
  },
  themeConfig: {
    navbar: {
      logo: {
        alt: "Grida Logo",
        src: "img/navbar-logo.svg",
        srcDark: "img/navbar-logo-dark.svg",
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
          docId: "reference/intro",
          position: "left",
          label: "Reference",
        },
        {
          type: "doc",
          docId: "wg/intro",
          position: "left",
          label: "Working Group",
        },
        {
          type: "doc",
          docId: "platform/intro",
          position: "left",
          label: "Platform",
        },
        {
          href: "https://grida.co/sign-in",
          position: "left",
          label: "Sign In",
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
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
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
  } satisfies Preset.ThemeConfig,
  presets: [
    [
      "@docusaurus/preset-classic",
      {
        docs: {
          routeBasePath: "/",
          path: "docs",
          sidebarPath: require.resolve("./sidebars.js"),
          editUrl: "https://github.com/gridaco/grida/tree/main/docs",
          remarkPlugins: [remarkMath],
          rehypePlugins: [[rehypeKatex, { strict: false }]],
        },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
        gtag: {
          trackingID: "G-T0S919XJ07",
          anonymizeIP: true,
        },
        sitemap: {
          changefreq: "weekly",
          priority: 0.5,
          lastmod: "date",
          ignorePatterns: ["/tags/**"],
        },
      },
    ],
  ],
};

module.exports = config;
