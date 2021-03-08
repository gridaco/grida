export type Sitemap = {
  label: string;
  href: string;
  child?: Sitemap[];
};

export const Products: Sitemap = {
  label: "Products",
  href: "/products",
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
      label: "Reflect",
      href: "https://reflect.bridged.xyz",
    },
    {
      label: "Surf",
      href: "https://surf.codes",
    },
    {
      label: "Assistant",
      href: "/assistant",
    },
    {
      label: "Console",
      href: "/console",
    },
    {
      label: "Appbox",
      href: "/appbox",
    },
  ],
};

export const Solutions: Sitemap = {
  label: "Solutions",
  href: "/solutions",
  child: [
    {
      label: "Showcase",
      href: "/showcase",
    },
    {
      label: "Handoff",
      href: "/handoff",
    },
    {
      label: "Get Started",
      href: "/getstart",
    },
  ],
};

export const Resources: Sitemap = {
  label: "Resources",
  href: "/resources",
  child: [
    {
      label: "Gettiing Started",
      href: "/docs/getting-started",
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
  href: "/platforms",
  child: [
    {
      label: "Figma",
      href: "/docs/platforms/figma",
    },
    {
      label: "Sketch",
      href: "/docs/platforms/sketch",
    },
    {
      label: "XD",
      href: "/docs/platforms/xd",
    },
    {
      label: "React",
      href: "/docs/platforms/react",
    },
    {
      label: "Flutter",
      href: "/docs/platforms/flutter",
    },
    {
      label: "Vue",
      href: "/docs/platforms/vue",
    },
    {
      label: "Svelte",
      href: "/docs/platforms/svelte",
    },
    {
      label: "HTML/CSS",
      href: "/docs/platforms/vanilla-web",
    },
    {
      label: "Reflect",
      href: "https://reflect.bridged.xyz",
    },
  ],
};

export const Together: Sitemap = {
  label: "Together",
  href: "https://together.bridged.xyz",
  child: [
    {
      label: "Let's create together",
      href: "/together/create",
    },
    {
      label: "How to contribute",
      href: "/together/contribute",
    },
    {
      label: "Github",
      href: "https://github.com/bridgedxyz",
    },
    {
      label: "Projects",
      href: "/together/projects",
    },
    {
      label: "Join us on Slack",
      href:
        "https://together.bridged.xyz/Bridged-OSS-Community-c6983f668e3e4204aed8856da0e73483",
    },
    {
      label: "Meetups",
      href:
        "https://together.bridged.xyz/Bridged-Meetups-e28469913e35444d80d29921559fe7ff",
    },
    {
      label: "Reddit",
      href: "https://www.reddit.com/r/bridged/",
    },
  ],
};

export const Sitemap: Sitemap[] = [
  Products,
  Solutions,
  Resources,
  Platforms,
  Together,
];
