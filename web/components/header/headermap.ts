import { URLS } from "utils/landingpage/constants";
export type GroupEntity = {
  type: "group";
  label: string;
  children: LinkEntity[];
  href?: string;
};

export type LinkEntity = {
  type: "link";
  label: string;
  href: string;
  tagline?: string;
};

export type Entity = LinkEntity | GroupEntity;

type Sitemap = Entity[];

export const HeaderMap: Sitemap = [
  // temporarily disabled
  //   Products,
  // temporarily disabled
  //   WhyBridged,
  // temporarily disabled - since the pricing policy is not firm
  // {
  //   label: "Pricing",
  //   href: "/pricing",
  // },
  {
    type: "group",
    label: "Products",
    href: "/products",
    children: [
      {
        type: "link",
        label: "Grida",
        href: "https://app.grida.co",
        tagline: "Design, Code, Manage in one place.",
      },
      {
        type: "link",
        label: "Code",
        href: "/code",
        tagline: "Design to Code - works with React, Flutter and more.",
      },
      {
        type: "link",
        label: "Figma Assistant",
        href: "/assistant",
        tagline: "Figma plugin for organizing your design and fly on the go",
      },
      {
        type: "link",
        label: "Console",
        href: "/console",
        tagline: "Manage your design system and components",
      },
      // {
      //   type: "link",
      //   label: "Handoff",
      //   href: "/handoff",
      //   tagline: "Automated sync & integration ready",
      // },
      // {
      //   type: "link",
      //   label: "CMS",
      //   href: "/cms",
      //   tagline: "Design-first Content management",
      // },
      // {
      //   type: "link",
      //   label: "Design Lint",
      //   href: "/lint",
      //   tagline: "Keep you design consistece and production ready",
      // },
      {
        type: "link",
        label: "CLI / API",
        href: "/cli",
        tagline:
          "Continuosly integrate your design into your code base with CLI and API.",
      },
      {
        type: "link",
        label: "VSCode Extension",
        href: "/vscode",
        tagline: "Copilot with the knowledge of your design.",
      },
    ],
  },
  {
    type: "link",
    label: "Docs",
    href: "/docs",
  },

  {
    type: "group",
    label: "Resources",
    children: [
      {
        type: "link",
        label: "Github",
        href: URLS.social.github,
      },
      {
        type: "link",
        label: "Join Slack Community",
        href: "https://grida.co/join-slack",
      },
      {
        type: "link",
        label: "Blog",
        href: URLS.social.medium,
      },
      {
        type: "link",
        label: "Contact Sales",
        href: "/contact/sales",
      },
      {
        type: "link",
        label: "News Room",
        href: "/newsroom",
      },
    ],
  },
  {
    type: "link",
    label: "Pricing",
    href: "/pricing",
  },
];
