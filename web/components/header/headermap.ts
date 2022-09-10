import { URLS } from "utils/landingpage/constants";
export type GroupEntity = {
  type: "group";
  label: string;
  children: LinkEntity[];
  href?: string;
};

type Icon = string;

export type LinkEntity = {
  type: "link";
  label: string;
  href: string;
  tagline?: string;
  icon?: Icon;
  layout?: "module-item" | "product-item";
};

export type Entity = LinkEntity | GroupEntity;

type Sitemap = Entity[];

const Frameworks: LinkEntity[] = [
  {
    type: "link",
    label: "CSS",
    href: "/vanilla#css",
    icon: "/module-icons/css",
    layout: "module-item",
  },
  {
    type: "link",
    label: "Expo",
    href: "/expo",
    icon: "/module-icons/expo",
    layout: "module-item",
  },
  {
    type: "link",
    label: "Flutter",
    href: "/flutter",
    icon: "/module-icons/flutter",
    layout: "module-item",
  },
  {
    type: "link",
    label: "Framer motion",
    href: "/framer-motion",
    icon: "/module-icons/framer-motion",
    layout: "module-item",
  },
  {
    type: "link",
    label: "Headless UI",
    href: "/headless-ui",
    icon: "/module-icons/headless-ui",
    layout: "module-item",
  },
  {
    type: "link",
    label: "HTML",
    href: "/vanilla",
    icon: "/module-icons/html",
    layout: "module-item",
  },
  {
    type: "link",
    label: "Jetpack Compose",
    href: "/jetpack-compose",
    icon: "/module-icons/jetpack-compose",
    layout: "module-item",
  },
  {
    type: "link",
    label: "Material UI",
    href: "/react-mui",
    icon: "/module-icons/mui",
    layout: "module-item",
  },
  {
    type: "link",
    label: "NextJS",
    href: "/nextjs",
    icon: "/module-icons/nextjs",
    layout: "module-item",
  },
  {
    type: "link",
    label: "NuxtJS",
    href: "/nuxtjs",
    icon: "/module-icons/nuxtjs",
    layout: "module-item",
  },
  {
    type: "link",
    label: "Preact",
    href: "/preact",
    icon: "/module-icons/preact",
    layout: "module-item",
  },
  {
    type: "link",
    label: "React",
    href: "/react",
    icon: "/module-icons/react",
    layout: "module-item",
  },
  {
    type: "link",
    label: "Scss",
    href: "/sass",
    icon: "/module-icons/sass",
    layout: "module-item",
  },
  {
    type: "link",
    label: "SolidJS",
    href: "/solid-js",
    icon: "/module-icons/solid-js",
    layout: "module-item",
  },
  {
    type: "link",
    label: "Storybook",
    href: "/storybook",
    icon: "/module-icons/storybook",
    layout: "module-item",
  },
  {
    type: "link",
    label: "Svelte",
    href: "/svelte",
    icon: "/module-icons/svelte",
    layout: "module-item",
  },
  {
    type: "link",
    label: "Swift UI",
    href: "/swiftui",
    icon: "/module-icons/swiftui",
    layout: "module-item",
  },
  {
    type: "link",
    label: "Tailwind CSS",
    href: "/sass",
    icon: "/module-icons/tailwindcss",
    layout: "module-item",
  },
  {
    type: "link",
    label: "Vue",
    href: "/vue",
    icon: "/module-icons/vue",
    layout: "module-item",
  },
  {
    type: "link",
    label: "Web Components",
    href: "/webcomponents",
    icon: "/module-icons/webcomponents",
    layout: "module-item",
  },
];

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
        layout: "product-item",
      },
      {
        type: "link",
        label: "Code",
        href: "/code",
        tagline: "Design to Code - works with React, Flutter and more.",
        layout: "product-item",
      },
      {
        type: "link",
        label: "Figma Assistant",
        href: "/assistant",
        tagline: "Figma plugin for organizing your design and fly on the go",
        layout: "product-item",
      },
      {
        type: "link",
        label: "Console",
        href: "/console",
        tagline: "Manage your design system and components",
        layout: "product-item",
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
        layout: "product-item",
      },
      {
        type: "link",
        label: "VSCode Extension",
        href: "/vscode",
        tagline: "Copilot with the knowledge of your design.",
        layout: "product-item",
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
    label: "Frameworks",
    children: Frameworks,
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
