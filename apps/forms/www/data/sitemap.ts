export namespace sitemap {
  export const links = {
    x: "https://x.com/grida_co",
    github: "https://github.com/gridaco",
    pricing: "/pricing",
    slack: "/join-slack",
    docs: "/docs",
    cms: "/cms", // TODO: no link
    privacy: "/privacy",
    toc: "/terms",
    forms: "/forms",
    canvas: "/canvas",
    cookies: "/cookies",
    signin: "/signin",
    cta: "/dashboard/new?plan=free",
    thebundle: "/bundle",
    figma: "/figma",
  };

  type Item = { title: string; href: string; description?: string };

  export const items = {
    docs: { title: "Docs", href: links.docs } satisfies Item,
    thebundle: { title: "The Bundle", href: links.thebundle } satisfies Item,
    joinslack: { title: "Join Slack", href: links.slack } satisfies Item,
    cms: {
      title: "CMS",
      href: links.cms,
      description: "Manage data, create pipelines & endpoints",
    } satisfies Item,
    forms: {
      title: "Forms",
      href: links.forms,
      description: "Get user responses, Launch MVP",
    } satisfies Item,
    canvas: {
      title: "Canvas",
      href: links.canvas,
      description: "Design Components and Websites",
    } satisfies Item,
    figmaci: {
      title: "Figma CI",
      href: links.figma,
      description: "CI for Figma Designs",
    } satisfies Item,
  };
}
