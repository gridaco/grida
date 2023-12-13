export type Sitemap = {
  label: string;
  href?: string;
  badge?: "alpha" | "beta";
  child?: Sitemap[];
};

export const Products: Sitemap = {
  label: "products.label",
  child: [
    {
      label: "products.code",
      href: "https://code.grida.co",
    },
    {
      label: "products.assistant",
      href: "/assistant",
    },
    {
      label: "products.cli",
      href: "/cli",
    },
    {
      label: "products.cloud",
      href: "/cloud",
    },
    {
      label: "products.globalization",
      href: "/globalization",
    },
    {
      label: "products.reflect-ui",
      href: "https://reflect-ui.com",
    },
    {
      label: "products.vscode",
      href: "/vscode",
    },
  ],
};

export const Solutions: Sitemap = {
  label: "solutions.label",
  child: [
    {
      label: "solutions.showcase",
      href: "/showcase",
    },
    {
      label: "solutions.handoff",
      href: "/handoff",
    },
    // {
    //   label: "Get Started",
    //   href: "/getstart",
    // },
  ],
};

export const Resources: Sitemap = {
  label: "resources.label",
  child: [
    {
      label: "Getting Started",
      href: "/docs/getting-started/intro",
    },
    {
      label: "resources.docs",
      href: "/docs",
    },
    {
      label: "resources.api-docs",
      href: "/docs/api",
    },
    {
      label: "resources.blogs",
      href: "https://medium.com/bridgedxyz",
    },
  ],
};

export const Platforms: Sitemap = {
  label: "platforms.label",
  child: [
    {
      label: "platforms.figma",
      href: "/docs/getting-started/intro",
    },
    // {
    //   label: "Sketch",
    //   href: "/sketch",
    // },
    // {
    //   label: "XD",
    //   href: "/adobe-xd",
    // },
    {
      label: "platforms.react",
      href: "/docs/with-react",
    },
    {
      label: "platforms.react-native",
      badge: "beta",
      href: "/docs/with-react-native",
    },
    {
      label: "platforms.flutter",
      href: "/docs/with-flutter",
    },
    // {
    //   label: "Vue",
    //   badge: "alpha",
    //   href: "/vue",
    // },
    // {
    //   label: "Svelte",
    //   badge: "alpha",
    //   href: "/svelte",
    // },
    {
      label: "platforms.vanilla",
      href: "/docs/with-vanilla",
    },
    {
      label: "platforms.reflect-ui",
      badge: "alpha",
      href: "https://reflect-ui.com/",
    },
  ],
};

export const Together: Sitemap = {
  label: "together.label",
  href: "/docs/together/contributing",
  child: [
    {
      label: "together.github",
      href: "https://github.com/gridaco",
    },
    {
      label: "together.projects",
      href: "/docs/together/projects",
    },
    {
      label: "together.support",
      href: "/docs/together/support",
    },
    {
      label: "together.slack",
      href: "https://grida.co/join-slack",
    },
    // {
    //   label: "Meetups",
    //   href:
    //     "https://together.bridged.xyz/Bridged-Meetups-e28469913e35444d80d29921559fe7ff",
    // },
    {
      label: "together.reddit",
      href: "https://www.reddit.com/r/gridaco/",
    },
  ],
};

export const Sitemap: Sitemap[] = [
  Products,
  // Solutions,
  Resources,
  Platforms,
  Together,
];
