import type { ResourceTypeIconName } from "@/components/resource-type-icon";

export namespace sitemap {
  export const links = {
    x: "https://x.com/grida_co",
    github: "https://github.com/gridaco",
    github_grida: "https://github.com/gridaco/grida",
    dashboard: "/dashboard",
    downlaods: "/downloads",
    packages: "/packages",
    ai_models: "/ai/models",
    sdk: "/sdk",
    tools: "/tools",
    library: "/library",
    releases_latest: "https://github.com/gridaco/grida/releases/latest",
    issues_new: "https://github.com/gridaco/grida/issues/new/choose",
    pricing: "/pricing",
    slack: "/join-slack",
    docs: "/docs",
    // TODO:
    docs_canvas_sdk: "/docs/canvas/sdk",
    contact: "/contact",
    database: "/database",
    privacy: "/privacy",
    toc: "/terms",
    forms: "/forms",
    forms_ai: "/forms/ai",
    canvas: "/canvas",
    west: "/west",
    cookies: "/cookies-policy",
    signin: "/sign-in",
    cta: "/dashboard/new?plan=free",
    thebundle: "/bundle",
    playground: "/playground",
    playground_forms: "/playground/forms",
    figma_ci: "/figma/ci",
    figma_assistant: "/figma/assistant",
    figma_vscode: "/figma/vscode",
    book15: "https://cal.com/universe-from-grida/15min",
    book30: "https://cal.com/universe-from-grida/30min",
    studio: "https://grida.studio",
    corssh: "https://cors.sh",
    blog: "/blog",
    fonts: "https://fonts.grida.co",
    changelog: "https://x.com/univ___erse",
  };

  type Item = {
    icon?: ResourceTypeIconName;
    title: string;
    href: string;
    description?: string;
  };

  export const items = {
    downloads: {
      title: "Downloads",
      href: links.downlaods,
      description: "Get Grida Desktop App",
    } satisfies Item,
    docs: {
      title: "Docs",
      href: links.docs,
      description: "Docs, Guides, Tutorials and API",
    } satisfies Item,
    thebundle: {
      title: "The Bundle",
      href: links.thebundle,
      description: "Collection of 3D Illustrations",
    } satisfies Item,
    joinslack: {
      title: "Join Slack",
      href: links.slack,
      description: "Join our Slack channel, chat with founders!",
    } satisfies Item,
    contact: {
      title: "Contact",
      href: links.contact,
      description: "Have questions? Contact Us",
    } satisfies Item,
    database: {
      icon: "database",
      title: "Database",
      href: links.database,
      description: "Manage data, create pipelines & endpoints",
    } satisfies Item,
    forms: {
      icon: "v0_form",
      title: "Forms",
      href: links.forms,
      description: "Get user responses, Launch MVP",
    } satisfies Item,
    canvas: {
      icon: "v0_canvas",
      title: "Canvas",
      href: links.canvas,
      description: "Design Components and Websites",
    } satisfies Item,
    library: {
      icon: "folder",
      title: "Library",
      href: links.library,
      description: "Free hand picked design resources",
    } satisfies Item,
    fonts: {
      title: "Fonts",
      href: links.fonts,
      description: "Open Fonts API",
    } satisfies Item,
    tools: {
      title: "Tools",
      href: links.tools,
      description: "Collection of Design Tools for your Daily work",
    } satisfies Item,
    west: {
      title: "WEST (beta)",
      href: links.west,
      description: "Welcome to West of referral marketing",
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
    figma_vscode: {
      title: "Grida VSCode Extension",
      href: links.figma_vscode,
      description: "Grida VSCode Extension",
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
