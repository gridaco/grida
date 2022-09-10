import { URLS } from "utils/landingpage/constants";
export type GroupEntity = {
  type: "group";
  label: string;
  children: Entity[];
  href?: string;
  layout?: "module-group";
};

type Icon = string;

export type LinkEntity = {
  type: "link";
  label: string;
  href: string;
  tagline?: string;
  icon?: Icon;
  layout?: "module-item" | "product-item" | "line-item";
};

export type Entity = LinkEntity | GroupEntity;

type Sitemap = Entity[];

const Frameworks: Sitemap = [
  // react
  {
    type: "group",
    label: "React",
    layout: "module-group",
    children: [
      {
        type: "link",
        label: "React",
        href: "/docs/with-react",
        icon: "/module-icons/react",
        layout: "module-item",
      },
      {
        type: "link",
        label: "NextJS",
        href: "/docs/with-nextjs",
        icon: "/module-icons/nextjs",
        layout: "module-item",
      },
      {
        type: "link",
        label: "Preact",
        href: "/docs/with-preact",
        icon: "/module-icons/preact",
        layout: "module-item",
      },
    ],
  },

  // vue
  {
    type: "group",
    label: "Vue",
    layout: "module-group",
    children: [
      {
        type: "link",
        label: "Vue",
        href: "/docs/with-vue",
        icon: "/module-icons/vue",
        layout: "module-item",
      },
      {
        type: "link",
        label: "NuxtJS",
        href: "/docs/with-nuxtjs",
        icon: "/module-icons/nuxtjs",
        layout: "module-item",
      },
    ],
  },

  // core web

  {
    type: "group",
    label: "Core web",
    layout: "module-group",
    children: [
      {
        type: "link",
        label: "Web Components",
        href: "/docs/with-webcomponents",
        icon: "/module-icons/webcomponents",
        layout: "module-item",
      },
      {
        type: "link",
        label: "HTML",
        href: "/docs/with-vanilla",
        icon: "/module-icons/html",
        layout: "module-item",
      },
      {
        type: "link",
        label: "Svelte",
        href: "/docs/with-svelte",
        icon: "/module-icons/svelte",
        layout: "module-item",
      },
      {
        type: "link",
        label: "SolidJS",
        href: "/docs/with-solid-js",
        icon: "/module-icons/solid-js",
        layout: "module-item",
      },
    ],
  },

  // Flutter
  {
    type: "group",
    label: "Flutter",
    layout: "module-group",
    children: [
      {
        type: "link",
        label: "Flutter",
        href: "/docs/with-flutter",
        icon: "/module-icons/flutter",
        layout: "module-item",
      },
    ],
  },

  // React Native
  {
    type: "group",
    label: "React Native",
    layout: "module-group",
    children: [
      {
        type: "link",
        label: "React Native",
        href: "/docs/with-react-native",
        icon: "/module-icons/react",
        layout: "module-item",
      },
      {
        type: "link",
        label: "Expo",
        href: "/docs/with-expo",
        icon: "/module-icons/expo",
        layout: "module-item",
      },
    ],
  },

  // iOS / AOS
  {
    type: "group",
    label: "iOS / Android",
    layout: "module-group",
    children: [
      {
        type: "link",
        label: "Jetpack Compose",
        href: "/docs/with-jetpack-compose",
        icon: "/module-icons/jetpack-compose",
        layout: "module-item",
      },
      {
        type: "link",
        label: "Swift UI",
        href: "/docs/with-swiftui",
        icon: "/module-icons/swiftui",
        layout: "module-item",
      },
    ],
  },

  // Modules
  {
    type: "group",
    label: "Modules",
    layout: "module-group",
    children: [
      {
        type: "link",
        label: "Storybook",
        href: "/docs/with-storybook",
        icon: "/module-icons/storybook",
        layout: "module-item",
      },
      {
        type: "link",
        label: "Material UI",
        href: "/docs/with-mui",
        icon: "/module-icons/mui",
        layout: "module-item",
      },
      {
        type: "link",
        label: "Emotion JS",
        href: "/emotion-js",
        icon: "/module-icons/emotion-js",
        layout: "module-item",
      },
      {
        type: "link",
        label: "CSS",
        href: "/docs/with-css",
        icon: "/module-icons/css",
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
        href: "/docs/with-headless-ui",
        icon: "/module-icons/headless-ui",
        layout: "module-item",
      },
      {
        type: "link",
        label: "Scss",
        href: "/docs/with-scss",
        icon: "/module-icons/sass",
        layout: "module-item",
      },
      {
        type: "link",
        label: "Styled Components",
        href: "/docs/with-styled-components",
        icon: "/module-icons/styled-components",
        layout: "module-item",
      },
      {
        type: "link",
        label: "Tailwind CSS",
        href: "/docs/with-tailwindcss",
        icon: "/module-icons/tailwindcss",
        layout: "module-item",
      },
    ],
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
        layout: "line-item",
      },
      {
        type: "link",
        label: "Join Slack Community",
        href: "https://grida.co/join-slack",
        layout: "line-item",
      },
      {
        type: "link",
        label: "Blog",
        href: URLS.social.medium,
        layout: "line-item",
      },
      {
        type: "link",
        label: "Contact Sales",
        href: "/contact/sales",
        layout: "line-item",
      },
      {
        type: "link",
        label: "Projects",
        href: "/projects",
        layout: "line-item",
      },
      {
        type: "link",
        label: "News Room",
        href: "/newsroom",
        layout: "line-item",
      },
      {
        type: "link",
        label: "Starter Kit",
        href: "/first-aid",
        layout: "line-item",
      },
      {
        type: "link",
        label: "Landingpage Kit",
        href: "/first-aid/landingpage-kit",
        layout: "line-item",
      },
      {
        type: "link",
        label: "Widget Catalog",
        href: "/widgets",
        layout: "line-item",
      },
      {
        type: "link",
        label: "Customer Stories",
        href: "/customers/stories",
        layout: "line-item",
      },
      {
        type: "link",
        label: "Jobs",
        href: "/jobs",
        layout: "line-item",
      },
    ],
  },
  {
    type: "link",
    label: "Pricing",
    href: "/pricing",
  },
];
