export namespace sitemap {
  export const links = {
    x: "https://x.com/grida_co",
    github: "https://github.com/gridaco",
    downlaods: "/downloads",
    releases_latest: "https://github.com/gridaco/grida/releases/latest",
    pricing: "/pricing",
    slack: "/join-slack",
    docs: "/docs",
    contact: "/contact",
    database: "/database", // FIXME: <DEADLINK> no link
    privacy: "/privacy",
    toc: "/terms",
    forms: "/forms",
    canvas: "/canvas",
    cookies: "/cookies-policy",
    signin: "/sign-in",
    cta: "/dashboard/new?plan=free",
    thebundle: "/bundle",
    playground: "/playground",
    figma_ci: "/figma/ci",
    figma_assistant: "/figma/assistant",
    book30: "https://cal.com/universe-from-grida/30min",
    studio: "https://grida.studio",
    corssh: "https://cors.sh",
    blog: "/blog",
    changelog: "https://x.com/univ___erse",
  };

  type Item = { title: string; href: string; description?: string };

  export const items = {
    downloads: { title: "Downloads", href: links.downlaods } satisfies Item,
    docs: { title: "Docs", href: links.docs } satisfies Item,
    thebundle: { title: "The Bundle", href: links.thebundle } satisfies Item,
    joinslack: { title: "Join Slack", href: links.slack } satisfies Item,
    contact: { title: "Contact", href: links.contact } satisfies Item,
    database: {
      title: "Database",
      href: links.database,
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
    figma_ci: {
      title: "Figma CI",
      href: links.figma_ci,
      description: "CI for Figma Designs",
    } satisfies Item,
    figma_assistant: {
      title: "Figma Assistant",
      href: links.figma_assistant,
      description: "AI powered Design Assistant",
    } satisfies Item,
    studio: {
      title: "Grida Studios",
      href: links.studio,
      description: "Team behind Grida",
    } satisfies Item,
    cors: {
      title: "CORS.SH",
      href: links.corssh,
      description: "CORS Proxy",
    } satisfies Item,
  };

  export namespace print {
    export const links = {
      contact: "/print/~/contact",
      order: "/print/~/order",
      templates: "/print/~/templates",
      materials: "/print/~/materials",
      design: "/print/~/design",
      ordercustom: "/print/~/order/custom",
    };
  }
}
