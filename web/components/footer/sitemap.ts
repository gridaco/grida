export type Sitemap = {
  label: string;
  href?: string;
  badge?: "alpha" | "beta";
  child?: Sitemap[];
};

export const Products: Sitemap = {
  label: "Products",
  child: [
    {
      label: "Cloud",
      href: "/cloud",
    },
    {
      label: "Globalization",
      href: "/globalization",
    },
    {
      label: "Reflect UI",
      href: "https://reflect-ui.com",
    },
    {
      label: "Assistant",
      href: "/assistant",
    },
    {
      label: "VSCode",
      href: "/vscode",
    },
    {
      label: "Console",
      href: "https://console.grida.co",
    },
    // {
    //   label: "Appbox",
    //   href: "/appbox",
    // },
    {
      label: "Surf",
      href: "https://surf.codes",
    },
  ],
};

export const Solutions: Sitemap = {
  label: "Solutions",
  child: [
    {
      label: "Showcase",
      href: "/showcase",
    },
    {
      label: "Handoff",
      href: "/handoff",
    },
    // {
    //   label: "Get Started",
    //   href: "/getstart",
    // },
  ],
};

export const Resources: Sitemap = {
  label: "Resources",
  child: [
    {
      label: "Gettiing Started",
      href: "/docs/getting-started/intro",
    },
    {
      label: "Docs",
      href: "/docs",
    },
    {
      label: "API Docs",
      href: "/docs/api",
    },
    {
      label: "Papers",
      href: "/resources/papers",
    },
    {
      label: "Blogs",
      href: "https://medium.com/bridgedxyz",
    },
  ],
};

export const Platforms: Sitemap = {
  label: "Platforms",
  child: [
    {
      label: "Figma",
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
      label: "React",
      href: "/react-js",
    },
    {
      label: "React Native",
      badge: "beta",
      href: "/react-native",
    },
    {
      label: "Flutter",
      href: "/flutter",
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
      label: "HTML/CSS",
      href: "/vanilla",
    },
    {
      label: "Reflect UI",
      badge: "alpha",
      href: "https://reflect-ui.com/",
    },
  ],
};

export const Together: Sitemap = {
  label: "Together",
  href: "/docs/together/contributing",
  child: [
    {
      label: "Github",
      href: "https://github.com/gridaco",
    },
    {
      label: "Projects",
      href: "/docs/together/projects",
    },
    {
      label: "Support",
      href: "/docs/together/support",
    },
    {
      label: "Join us on Slack",
      href: "https://grida.co/join-slack",
    },
    // {
    //   label: "Meetups",
    //   href:
    //     "https://together.bridged.xyz/Bridged-Meetups-e28469913e35444d80d29921559fe7ff",
    // },
    {
      label: "Reddit",
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
