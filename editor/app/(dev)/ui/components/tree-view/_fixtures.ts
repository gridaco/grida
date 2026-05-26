import {
  InMemoryTreeSource,
  type NodeId,
  type TreeNode,
} from "@grida/tree-view";

/**
 * Layer-panel-shaped fixture for the demo. Containers, leaves, and locked
 * nodes are encoded in `meta`.
 */
export type DemoKind =
  // shared canvas-style
  | "frame"
  | "group"
  | "rect"
  | "text"
  | "image"
  | "locked"
  // figma-extras
  | "component"
  | "instance"
  | "vector"
  | "boolean"
  // vscode / finder filesystem-extras
  | "folder"
  | "file"
  | "app"
  | "doc"
  | "media";

export interface DemoMeta {
  kind: DemoKind;
  label?: string;
  /**
   * Consumer-defined semantic: this container "masks" its children. Drives
   * a styled guide line in the demo's row renderer, as a worked example of
   * how the SDK user can decorate the indent rail per-ancestor.
   */
  mask?: boolean;
  // figma-style
  visible?: boolean;
  // vscode-style
  ext?: string;
  dirty?: boolean;
  // finder-style
  size?: string;
  modifiedAt?: string;
  kindLabel?: string;
  // notion-style
  /** Leading emoji shown before the label (Notion sidebar pages). */
  emoji?: string;
}

export function buildLayersFixture(): InMemoryTreeSource<DemoMeta> {
  const nodes: TreeNode<DemoMeta>[] = [
    {
      id: "<root>",
      parent: null,
      children: ["frame-1", "group-1", "rect-loose", "text-1"],
      meta: { kind: "frame", label: "Document" },
    },
    {
      id: "frame-1",
      parent: "<root>",
      children: ["frame-1-bg", "frame-1-content"],
      meta: { kind: "frame", label: "Hero Frame" },
    },
    {
      id: "frame-1-bg",
      parent: "frame-1",
      children: [],
      meta: { kind: "rect", label: "Background" },
    },
    {
      id: "frame-1-content",
      parent: "frame-1",
      children: ["frame-1-title", "frame-1-cta"],
      meta: { kind: "group", label: "Content" },
    },
    {
      id: "frame-1-title",
      parent: "frame-1-content",
      children: [],
      meta: { kind: "text", label: "Heading" },
    },
    {
      id: "frame-1-cta",
      parent: "frame-1-content",
      children: [],
      meta: { kind: "rect", label: "CTA Button" },
    },
    {
      id: "group-1",
      parent: "<root>",
      children: ["group-1-a", "group-1-b", "locked-1"],
      meta: { kind: "group", label: "Mask group", mask: true },
    },
    {
      id: "group-1-a",
      parent: "group-1",
      children: [],
      meta: { kind: "rect", label: "Rectangle 1" },
    },
    {
      id: "group-1-b",
      parent: "group-1",
      children: [],
      meta: { kind: "rect", label: "Rectangle 2" },
    },
    {
      id: "locked-1",
      parent: "group-1",
      children: [],
      meta: { kind: "locked", label: "Locked layer" },
    },
    {
      id: "rect-loose",
      parent: "<root>",
      children: [],
      meta: { kind: "rect", label: "Stray rectangle" },
    },
    {
      id: "text-1",
      parent: "<root>",
      children: [],
      meta: { kind: "text", label: "Caption" },
    },
  ];

  return new InMemoryTreeSource<DemoMeta>({
    root: "<root>",
    nodes,
    showRoot: false,
  });
}

export const CONTAINER_KINDS = new Set([
  "frame",
  "group",
  "component",
  "instance",
  "boolean",
  "folder",
]);

export function buildGridaFixture(): InMemoryTreeSource<DemoMeta> {
  const nodes: TreeNode<DemoMeta>[] = [
    {
      id: "<root>",
      parent: null,
      children: ["page-home", "page-pricing", "assets"],
      meta: { kind: "frame", label: "Project" },
    },
    {
      id: "page-home",
      parent: "<root>",
      children: ["hero", "features", "footer"],
      meta: { kind: "frame", label: "Home" },
    },
    {
      id: "hero",
      parent: "page-home",
      children: ["hero-title", "hero-sub", "hero-cta", "hero-art"],
      meta: { kind: "group", label: "Hero section" },
    },
    {
      id: "hero-title",
      parent: "hero",
      children: [],
      meta: { kind: "text", label: "Design without limits" },
    },
    {
      id: "hero-sub",
      parent: "hero",
      children: [],
      meta: { kind: "text", label: "Subheading" },
    },
    {
      id: "hero-cta",
      parent: "hero",
      children: [],
      meta: { kind: "rect", label: "Get started →" },
    },
    {
      id: "hero-art",
      parent: "hero",
      children: [],
      meta: { kind: "image", label: "hero-illustration.svg" },
    },
    {
      id: "features",
      parent: "page-home",
      children: ["feat-a", "feat-b", "feat-c"],
      meta: { kind: "group", label: "Features" },
    },
    {
      id: "feat-a",
      parent: "features",
      children: [],
      meta: { kind: "rect", label: "Card / Canvas" },
    },
    {
      id: "feat-b",
      parent: "features",
      children: [],
      meta: { kind: "rect", label: "Card / Forms" },
    },
    {
      id: "feat-c",
      parent: "features",
      children: [],
      meta: { kind: "rect", label: "Card / Database" },
    },
    {
      id: "footer",
      parent: "page-home",
      children: [],
      meta: { kind: "rect", label: "Footer" },
    },
    {
      id: "page-pricing",
      parent: "<root>",
      children: [],
      meta: { kind: "frame", label: "Pricing" },
    },
    {
      id: "assets",
      parent: "<root>",
      children: ["logo", "wordmark"],
      meta: { kind: "group", label: "Assets" },
    },
    {
      id: "logo",
      parent: "assets",
      children: [],
      meta: { kind: "image", label: "logo.svg" },
    },
    {
      id: "wordmark",
      parent: "assets",
      children: [],
      meta: { kind: "image", label: "wordmark.svg" },
    },
  ];
  return new InMemoryTreeSource<DemoMeta>({
    root: "<root>",
    nodes,
    showRoot: false,
  });
}

export function buildFigmaFixture(): InMemoryTreeSource<DemoMeta> {
  const nodes: TreeNode<DemoMeta>[] = [
    {
      id: "<root>",
      parent: null,
      children: ["page-1"],
      meta: { kind: "frame", label: "Page 1" },
    },
    {
      id: "page-1",
      parent: "<root>",
      children: ["frame-iphone", "comp-button", "instance-btn", "vector-star"],
      meta: { kind: "frame", label: "iPhone 15 — 393×852", visible: true },
    },
    {
      id: "frame-iphone",
      parent: "page-1",
      children: ["status-bar", "content", "tab-bar"],
      meta: { kind: "frame", label: "iPhone Frame", visible: true },
    },
    {
      id: "status-bar",
      parent: "frame-iphone",
      children: [],
      meta: { kind: "rect", label: "Status Bar", visible: true },
    },
    {
      id: "content",
      parent: "frame-iphone",
      children: ["card-1", "card-2"],
      meta: { kind: "group", label: "Content", visible: true },
    },
    {
      id: "card-1",
      parent: "content",
      children: ["card-1-img", "card-1-title"],
      meta: { kind: "frame", label: "Card 1", visible: true },
    },
    {
      id: "card-1-img",
      parent: "card-1",
      children: [],
      meta: { kind: "image", label: "Cover.png", visible: true },
    },
    {
      id: "card-1-title",
      parent: "card-1",
      children: [],
      meta: { kind: "text", label: "Daily Mix", visible: true },
    },
    {
      id: "card-2",
      parent: "content",
      children: [],
      meta: { kind: "frame", label: "Card 2", visible: false },
    },
    {
      id: "tab-bar",
      parent: "frame-iphone",
      children: [],
      meta: { kind: "rect", label: "Tab Bar (locked)", visible: true },
    },
    {
      id: "comp-button",
      parent: "page-1",
      children: ["btn-bg", "btn-label"],
      meta: { kind: "component", label: "Button / Primary", visible: true },
    },
    {
      id: "btn-bg",
      parent: "comp-button",
      children: [],
      meta: { kind: "rect", label: "Background", visible: true },
    },
    {
      id: "btn-label",
      parent: "comp-button",
      children: [],
      meta: { kind: "text", label: "Label", visible: true },
    },
    {
      id: "instance-btn",
      parent: "page-1",
      children: [],
      meta: { kind: "instance", label: "Button / Primary", visible: true },
    },
    {
      id: "vector-star",
      parent: "page-1",
      children: [],
      meta: { kind: "vector", label: "Star", visible: true },
    },
  ];
  return new InMemoryTreeSource<DemoMeta>({
    root: "<root>",
    nodes,
    showRoot: false,
  });
}

export function buildVSCodeFixture(): InMemoryTreeSource<DemoMeta> {
  const nodes: TreeNode<DemoMeta>[] = [
    {
      id: "<root>",
      parent: null,
      children: ["src", "public", "pkg-json", "tsconfig", "readme"],
      meta: { kind: "folder", label: "my-app" },
    },
    {
      id: "src",
      parent: "<root>",
      children: ["src-components", "src-app", "src-lib", "src-index"],
      meta: { kind: "folder", label: "src" },
    },
    {
      id: "src-components",
      parent: "src",
      children: ["button", "card"],
      meta: { kind: "folder", label: "components" },
    },
    {
      id: "button",
      parent: "src-components",
      children: [],
      meta: { kind: "file", label: "Button.tsx", ext: "tsx" },
    },
    {
      id: "card",
      parent: "src-components",
      children: [],
      meta: { kind: "file", label: "Card.tsx", ext: "tsx", dirty: true },
    },
    {
      id: "src-app",
      parent: "src",
      children: ["page", "layout", "globals"],
      meta: { kind: "folder", label: "app" },
    },
    {
      id: "page",
      parent: "src-app",
      children: [],
      meta: { kind: "file", label: "page.tsx", ext: "tsx" },
    },
    {
      id: "layout",
      parent: "src-app",
      children: [],
      meta: { kind: "file", label: "layout.tsx", ext: "tsx" },
    },
    {
      id: "globals",
      parent: "src-app",
      children: [],
      meta: { kind: "file", label: "globals.css", ext: "css" },
    },
    {
      id: "src-lib",
      parent: "src",
      children: ["utils", "api"],
      meta: { kind: "folder", label: "lib" },
    },
    {
      id: "utils",
      parent: "src-lib",
      children: [],
      meta: { kind: "file", label: "utils.ts", ext: "ts" },
    },
    {
      id: "api",
      parent: "src-lib",
      children: [],
      meta: { kind: "file", label: "api.ts", ext: "ts", dirty: true },
    },
    {
      id: "src-index",
      parent: "src",
      children: [],
      meta: { kind: "file", label: "index.ts", ext: "ts" },
    },
    {
      id: "public",
      parent: "<root>",
      children: ["favicon", "vercel-svg"],
      meta: { kind: "folder", label: "public" },
    },
    {
      id: "favicon",
      parent: "public",
      children: [],
      meta: { kind: "file", label: "favicon.ico", ext: "ico" },
    },
    {
      id: "vercel-svg",
      parent: "public",
      children: [],
      meta: { kind: "file", label: "vercel.svg", ext: "svg" },
    },
    {
      id: "pkg-json",
      parent: "<root>",
      children: [],
      meta: { kind: "file", label: "package.json", ext: "json" },
    },
    {
      id: "tsconfig",
      parent: "<root>",
      children: [],
      meta: { kind: "file", label: "tsconfig.json", ext: "json" },
    },
    {
      id: "readme",
      parent: "<root>",
      children: [],
      meta: { kind: "file", label: "README.md", ext: "md" },
    },
  ];
  return new InMemoryTreeSource<DemoMeta>({
    root: "<root>",
    nodes,
    showRoot: false,
  });
}

export function buildFinderFixture(): InMemoryTreeSource<DemoMeta> {
  const nodes: TreeNode<DemoMeta>[] = [
    {
      id: "<root>",
      parent: null,
      children: ["documents", "downloads", "apps"],
      meta: { kind: "folder", label: "softmarshmallow" },
    },
    {
      id: "documents",
      parent: "<root>",
      children: ["proj-grida", "resume", "screenshot"],
      meta: {
        kind: "folder",
        label: "Documents",
        kindLabel: "Folder",
        size: "—",
        modifiedAt: "Today, 9:14 AM",
      },
    },
    {
      id: "proj-grida",
      parent: "documents",
      children: ["readme-md", "notes-md"],
      meta: {
        kind: "folder",
        label: "grida",
        kindLabel: "Folder",
        size: "—",
        modifiedAt: "Yesterday, 18:32",
      },
    },
    {
      id: "readme-md",
      parent: "proj-grida",
      children: [],
      meta: {
        kind: "doc",
        label: "README.md",
        kindLabel: "Markdown Document",
        size: "4 KB",
        modifiedAt: "May 14, 2026",
      },
    },
    {
      id: "notes-md",
      parent: "proj-grida",
      children: [],
      meta: {
        kind: "doc",
        label: "Notes.md",
        kindLabel: "Markdown Document",
        size: "12 KB",
        modifiedAt: "May 10, 2026",
      },
    },
    {
      id: "resume",
      parent: "documents",
      children: [],
      meta: {
        kind: "doc",
        label: "Resume.pdf",
        kindLabel: "PDF Document",
        size: "212 KB",
        modifiedAt: "Apr 2, 2026",
      },
    },
    {
      id: "screenshot",
      parent: "documents",
      children: [],
      meta: {
        kind: "media",
        label: "Screenshot.png",
        kindLabel: "PNG image",
        size: "1.4 MB",
        modifiedAt: "Today, 8:01 AM",
      },
    },
    {
      id: "downloads",
      parent: "<root>",
      children: ["installer", "movie"],
      meta: {
        kind: "folder",
        label: "Downloads",
        kindLabel: "Folder",
        size: "—",
        modifiedAt: "Today, 7:55 AM",
      },
    },
    {
      id: "installer",
      parent: "downloads",
      children: [],
      meta: {
        kind: "app",
        label: "Installer.dmg",
        kindLabel: "Disk Image",
        size: "92 MB",
        modifiedAt: "May 12, 2026",
      },
    },
    {
      id: "movie",
      parent: "downloads",
      children: [],
      meta: {
        kind: "media",
        label: "Trailer.mp4",
        kindLabel: "MPEG-4 Movie",
        size: "184 MB",
        modifiedAt: "May 3, 2026",
      },
    },
    {
      id: "apps",
      parent: "<root>",
      children: ["app-figma", "app-vscode", "app-grida"],
      meta: {
        kind: "folder",
        label: "Applications",
        kindLabel: "Folder",
        size: "—",
        modifiedAt: "May 16, 2026",
      },
    },
    {
      id: "app-figma",
      parent: "apps",
      children: [],
      meta: {
        kind: "app",
        label: "Figma.app",
        kindLabel: "Application",
        size: "412 MB",
        modifiedAt: "May 16, 2026",
      },
    },
    {
      id: "app-vscode",
      parent: "apps",
      children: [],
      meta: {
        kind: "app",
        label: "Visual Studio Code.app",
        kindLabel: "Application",
        size: "326 MB",
        modifiedAt: "May 15, 2026",
      },
    },
    {
      id: "app-grida",
      parent: "apps",
      children: [],
      meta: {
        kind: "app",
        label: "Grida.app",
        kindLabel: "Application",
        size: "188 MB",
        modifiedAt: "May 17, 2026",
      },
    },
  ];
  return new InMemoryTreeSource<DemoMeta>({
    root: "<root>",
    nodes,
    showRoot: false,
  });
}

export function isContainerMeta(meta: DemoMeta | undefined): boolean {
  return !!meta && CONTAINER_KINDS.has(meta.kind);
}

/**
 * Generate a wide tree for the virtualization demo.
 *
 * @param total target total node count
 */
export function buildLargeFixture(total: number): {
  source: InMemoryTreeSource<{ label: string }>;
  rootChildren: NodeId[];
} {
  const nodes: TreeNode<{ label: string }>[] = [];
  nodes.push({
    id: "<root>",
    parent: null,
    children: [],
    meta: { label: "Document" },
  });
  // Build a 3-level tree to hit the target size with branching factor ~ cbrt(total).
  const groups = 20;
  const perGroup = Math.ceil(total / groups);
  const rootChildren: NodeId[] = [];
  let id = 0;
  for (let g = 0; g < groups; g++) {
    const groupId = `g${g}`;
    rootChildren.push(groupId);
    const groupChildren: NodeId[] = [];
    nodes.push({
      id: groupId,
      parent: "<root>",
      children: groupChildren,
      meta: { label: `Group ${g + 1}` },
    });
    for (let i = 0; i < perGroup; i++) {
      const cid = `n${id++}`;
      groupChildren.push(cid);
      nodes.push({
        id: cid,
        parent: groupId,
        children: [],
        meta: { label: `Item ${cid}` },
      });
      if (id >= total - groups) break;
    }
    // Mutate children list (fixture builder, not runtime API).
    (
      nodes[nodes.length - groupChildren.length - 1] as unknown as {
        children: NodeId[];
      }
    ).children = groupChildren;
  }
  // Mutate root.children (fixture builder, not runtime API).
  (nodes[0] as unknown as { children: NodeId[] }).children = rootChildren;

  return {
    source: new InMemoryTreeSource({
      root: "<root>",
      nodes,
      showRoot: false,
    }),
    rootChildren,
  };
}

/**
 * Generate a deeply-nested tree for the "virtualized + deep" stress demo.
 * Each top-level child opens to a single linear chain of `depth` nodes,
 * so the deepest visible row sits at indent `depth × indentStep` — useful
 * for deciding what to do about horizontal overflow.
 *
 * Visible rows = `groups × (depth + 1)` (each chain's group row plus
 * its `depth` nodes); the root is hidden.
 *
 * @param groups  number of top-level chains
 * @param depth   chain length (= max visible row depth)
 */

/**
 * Notion-style sidebar fixture. Folders are pages with children (collapsible),
 * files are leaf pages. Each page carries a single emoji which the Notion row
 * renderer paints in front of the label. Drag-reorder + drag-into-page work
 * the same as the filesystem fixtures.
 */
export function buildNotionFixture(): InMemoryTreeSource<DemoMeta> {
  const nodes: TreeNode<DemoMeta>[] = [
    {
      id: "<root>",
      parent: null,
      children: ["getting-started", "personal", "team", "templates"],
      meta: { kind: "folder", label: "Workspace" },
    },
    {
      id: "getting-started",
      parent: "<root>",
      children: [],
      meta: { kind: "file", label: "Getting Started", emoji: "👋" },
    },
    {
      id: "personal",
      parent: "<root>",
      children: ["tasks", "notes", "reading-list"],
      meta: { kind: "folder", label: "Personal", emoji: "🏡" },
    },
    {
      id: "tasks",
      parent: "personal",
      children: [],
      meta: { kind: "file", label: "Tasks", emoji: "✅" },
    },
    {
      id: "notes",
      parent: "personal",
      children: [],
      meta: { kind: "file", label: "Notes", emoji: "📝" },
    },
    {
      id: "reading-list",
      parent: "personal",
      children: [],
      meta: { kind: "file", label: "Reading list", emoji: "📚" },
    },
    {
      id: "team",
      parent: "<root>",
      children: ["engineering", "design", "product"],
      meta: { kind: "folder", label: "Team", emoji: "👥" },
    },
    {
      id: "engineering",
      parent: "team",
      children: ["eng-sprint", "eng-oncall"],
      meta: { kind: "folder", label: "Engineering", emoji: "🛠" },
    },
    {
      id: "eng-sprint",
      parent: "engineering",
      children: [],
      meta: { kind: "file", label: "Sprint planning", emoji: "🗓" },
    },
    {
      id: "eng-oncall",
      parent: "engineering",
      children: [],
      meta: { kind: "file", label: "On-call runbook", emoji: "🚨" },
    },
    {
      id: "design",
      parent: "team",
      children: ["design-system", "design-reviews"],
      meta: { kind: "folder", label: "Design", emoji: "🎨" },
    },
    {
      id: "design-system",
      parent: "design",
      children: [],
      meta: { kind: "file", label: "Design system", emoji: "🧩" },
    },
    {
      id: "design-reviews",
      parent: "design",
      children: [],
      meta: { kind: "file", label: "Design reviews", emoji: "👀" },
    },
    {
      id: "product",
      parent: "team",
      children: ["roadmap", "specs"],
      meta: { kind: "folder", label: "Product", emoji: "📋" },
    },
    {
      id: "roadmap",
      parent: "product",
      children: [],
      meta: { kind: "file", label: "Roadmap", emoji: "🗺" },
    },
    {
      id: "specs",
      parent: "product",
      children: [],
      meta: { kind: "file", label: "Specs", emoji: "📐" },
    },
    {
      id: "templates",
      parent: "<root>",
      children: ["tpl-meeting", "tpl-rfc"],
      meta: { kind: "folder", label: "Templates", emoji: "🗂" },
    },
    {
      id: "tpl-meeting",
      parent: "templates",
      children: [],
      meta: { kind: "file", label: "Meeting notes", emoji: "🪑" },
    },
    {
      id: "tpl-rfc",
      parent: "templates",
      children: [],
      meta: { kind: "file", label: "RFC", emoji: "📄" },
    },
  ];
  return new InMemoryTreeSource<DemoMeta>({
    root: "<root>",
    nodes,
    showRoot: false,
  });
}

/**
 * Build a deeply-nested fixture for stress-testing virtualization and the
 * indent rail. Returns the source plus the helpers the consumer needs to
 * pre-expand the chain.
 */
export function buildDeepFixture(opts: { groups: number; depth: number }): {
  source: InMemoryTreeSource<{ label: string }>;
  expanded: NodeId[];
  maxDepth: number;
  total: number;
} {
  const { groups, depth } = opts;
  const nodes: TreeNode<{ label: string }>[] = [];
  nodes.push({
    id: "<root>",
    parent: null,
    children: [],
    meta: { label: "Document" },
  });
  const rootChildren: NodeId[] = [];
  const expanded: NodeId[] = [];
  for (let g = 0; g < groups; g++) {
    const groupId = `g${g}`;
    rootChildren.push(groupId);
    expanded.push(groupId);
    // Build the chain bottom-up so every parent's children array is final
    // by the time we push it.
    const chainIds: string[] = [];
    for (let d = 0; d < depth; d++) chainIds.push(`g${g}-n${d}`);
    // Last node has no children.
    nodes.push({
      id: chainIds[chainIds.length - 1]!,
      parent: chainIds[chainIds.length - 2] ?? groupId,
      children: [],
      meta: { label: `g${g} · depth ${depth - 1}` },
    });
    for (let d = chainIds.length - 2; d >= 0; d--) {
      const id = chainIds[d]!;
      const parent = d === 0 ? groupId : chainIds[d - 1]!;
      const childId = chainIds[d + 1]!;
      nodes.push({
        id,
        parent,
        children: [childId],
        meta: { label: `g${g} · depth ${d}` },
      });
      expanded.push(id);
    }
    nodes.push({
      id: groupId,
      parent: "<root>",
      children: [chainIds[0]!],
      meta: { label: `Chain ${g + 1}` },
    });
  }
  // Wire root.children
  (nodes[0] as unknown as { children: NodeId[] }).children = rootChildren;

  return {
    source: new InMemoryTreeSource({
      root: "<root>",
      nodes,
      showRoot: false,
    }),
    expanded,
    maxDepth: depth,
    total: groups * (depth + 1),
  };
}
