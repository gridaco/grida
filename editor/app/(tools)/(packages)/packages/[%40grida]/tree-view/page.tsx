"use client";

import {
  FigmaShowcase,
  FinderShowcase,
  GridaShowcase,
  NotionShowcase,
  VSCodeShowcase,
} from "@/app/(dev)/ui/components/tree-view/_showcase";
import { RegistryExample } from "@/components/registry-example";
import { NpmLogoIcon } from "@/components/logos/npm";
import { Button } from "@/components/ui/button";
import { CopyToClipboardInput } from "@/components/copy-to-clipboard-input";
import { Resources } from "@/resources";
import Footer from "@/www/footer";
import Header from "@/www/header";
import { ArrowRightIcon, BookOpenIcon, GithubIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const NPM_URL = "https://www.npmjs.com/package/@grida/tree-view";
const GITHUB_URL =
  "https://github.com/gridaco/grida/tree/main/packages/grida-tree-view";
const DOCS_PATH = "/ui/components/tree-view";

export default function TreeViewLandingPage() {
  return (
    <main className="min-h-screen">
      <Header className="relative" />

      {/* Hero — merged with the synced-editor intro: one TreeController,
          many trees. The CTAs and the install snippet stay as-is. */}
      <section className="container mx-auto px-4 pt-32 pb-12">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-600">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Zero runtime dependencies · ESM + CJS · MIT
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight font-mono">
            @grida/tree-view
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Headless, agnostic tree-view controller for editors and IDEs — a
            pure state machine plus a small set of helpers, rendered with
            whatever framework you want. The showcases below are the{" "}
            <strong>same</strong>{" "}
            <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-[15px]">
              TreeController
            </code>{" "}
            wired to different surfaces — canvas, explorer, document, desktop.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href={DOCS_PATH}>
              <Button size="lg">
                <BookOpenIcon className="size-4 mr-2" />
                Documentation
                <ArrowRightIcon className="size-4 ml-2" />
              </Button>
            </Link>
            <Link href={NPM_URL} target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="outline">
                <NpmLogoIcon className="size-8 mr-1" />
                npm
              </Button>
            </Link>
            <Link href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="outline">
                <GithubIcon className="size-4 mr-2" />
                GitHub
              </Button>
            </Link>
          </div>
          <div className="pt-2 max-w-sm mx-auto">
            <CopyToClipboardInput value="pnpm add @grida/tree-view" />
          </div>
        </div>
      </section>

      {/* Themed showcases — one section each */}
      <GridaShowcase />
      <FigmaShowcase />
      <VSCodeShowcase />
      <NotionShowcase />
      <FinderShowcase />

      {/* Quick start — live Preview / Code tabs, mirroring shadcn-ui's
          example pattern. The pitch sits beside the example on md+, stacks
          below on smaller viewports. Shares the same `max-w-5xl` container
          as the features and CTA sections so the left edges align. */}
      <section className="container mx-auto px-4 py-16 border-t border-zinc-200">
        <div className="max-w-5xl mx-auto grid gap-8 md:grid-cols-[1fr_1.4fr] md:items-center md:gap-12">
          <div className="space-y-4">
            <h2 className="text-3xl font-bold tracking-tight">
              A tree in 50 lines.
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              One source, one controller, one provider. Render the rows with
              whatever markup you want — the package owns expansion and
              selection, your store owns the data.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <div className="w-full max-w-xs">
                <CopyToClipboardInput value="npx shadcn@latest add https://grida.co/r/tree-view-row.json" />
              </div>
            </div>
            <Link href={NPM_URL} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <NpmLogoIcon className="size-6 mr-1" />
                View on npm
                <ArrowRightIcon className="size-3.5 ml-1.5" />
              </Button>
            </Link>
          </div>
          <RegistryExample
            name="examples/tree-view/quick-start"
            code={QUICK_START_SNIPPET}
          />
        </div>
      </section>

      {/* Features — surfaces the package has already shipped against. Each
          card mirrors one of the showcases above, using its app icon. */}
      <section className="container mx-auto px-4 py-16 border-t border-zinc-200">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-2xl mb-10 space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">
              Built for editor scale.
            </h2>
            <p className="text-muted-foreground">
              The state machine, the math, the intents — packaged so adopters
              ship a tree in a day, not a quarter.
            </p>
          </div>
          <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-5">
            {features.map((f) => (
              <div key={f.title} className="space-y-3">
                <Image
                  src={f.icon}
                  alt={f.title}
                  width={40}
                  height={40}
                  draggable={false}
                  className="size-10 select-none drop-shadow-md"
                />
                <h3 className="text-sm font-semibold">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA — matches the other sections: max-w-5xl container, left-aligned
          heading and body, the action sits on the right at md+ and stacks
          below on smaller viewports. Extra bottom padding so it breathes
          before the footer. */}
      <section className="container mx-auto px-4 pt-16 pb-32 border-t border-zinc-200 md:pb-40">
        <div className="max-w-5xl mx-auto flex flex-col items-start gap-6 md:flex-row md:items-end md:justify-between md:gap-12">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">
              See every pattern.
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The documentation page walks through 18 panels — themed showcases,
              virtualization at 10,000 rows, inline rename, type-ahead, grouping
              highlights, and more.
            </p>
          </div>
          <Link href={DOCS_PATH} className="shrink-0">
            <Button size="lg">
              Open documentation
              <ArrowRightIcon className="size-4 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}

// Compact code shown in the marketing "Code" tab. Not the literal installed
// source — that's `registry/examples/tree-view/quick-start.tsx`. The live
// <Preview> tab runs the real component; this snippet shows the same shape
// (click to select, click a folder to expand, drag to reorder) at the line
// count promised in the section heading.
const QUICK_START_SNIPPET = `import { disallowDescendant, InMemoryTreeSource, placementFromY, TreeController } from "@grida/tree-view";
import { TreeProvider, useTree, useTreeSnapshot } from "@grida/tree-view/react";

const controller = new TreeController({
  source: new InMemoryTreeSource({
    root: "<root>", showRoot: false,
    nodes: [
      { id: "<root>", parent: null, children: ["fruits"] },
      { id: "fruits", parent: "<root>", children: ["apple", "banana"], meta: { label: "🍎 Fruits" } },
      { id: "apple", parent: "fruits", children: [], meta: { label: "Apple" } },
      { id: "banana", parent: "fruits", children: [], meta: { label: "Banana" } },
    ],
  }),
  expanded: ["fruits"],
  constraint: disallowDescendant(),
});

function Row({ id, depth }) {
  const c = useTree();
  const sel = useTreeSnapshot((c) => c.getSelection().includes(id));
  const exp = useTreeSnapshot((c) => c.isExpanded(id));
  const drop = useTreeSnapshot((c) => { const p = c.getDrag()?.getPosition(); return p?.over === id ? p.placement : "none"; });
  const node = c.source.getNode(id);
  const folder = node.children.length > 0;
  const onPointerDown = (e) => {
    const x0 = e.clientX, y0 = e.clientY; let drag = null;
    const onMove = (ev) => {
      if (!drag && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 4) drag = c.startDrag([id]);
      const row = drag && document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-tree-row]");
      if (!row) return;
      const r = row.getBoundingClientRect();
      drag.over(row.dataset.treeRow, placementFromY(ev.clientY - r.top, r.height));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp);
      if (!drag) { c.select([id], "replace"); if (folder) exp ? c.collapse(id) : c.expand(id); return; }
      const intent = c.commitDrag(); if (intent) c.source.applyIntent(intent);
    };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
  };
  return (
    <div data-tree-row={id} data-state={sel ? "selected" : "idle"} data-drop={drop} onPointerDown={onPointerDown}
      style={{ paddingLeft: depth * 16 }}
      className="relative cursor-pointer rounded py-1 hover:bg-zinc-100 data-[state=selected]:bg-blue-100 data-[drop=into]:ring-2 data-[drop=into]:ring-blue-400">
      {folder ? (exp ? "▾ " : "▸ ") : "  "}{node.meta?.label ?? id}
    </div>
  );
}

function Tree() {
  const rows = useTreeSnapshot((c) => c.getRows());
  return <div>{rows.map((r) => <Row key={r.id} id={r.id} depth={r.depth} />)}</div>;
}

export default () => <TreeProvider controller={controller}><Tree /></TreeProvider>;
`;

const features: { icon: string; title: string; body: string }[] = [
  {
    icon: Resources.assets.macos.icons.grida,
    title: "Canvas layers",
    body: "Reverse-children flatten, group highlight, selection-aware drag — the controller already knows what a design tool's layers panel needs.",
  },
  {
    icon: Resources.assets.macos.icons.figma,
    title: "Dark layers panel",
    body: "Same controller, themed for any palette. Compose constraints to enforce frame / component / instance semantics.",
  },
  {
    icon: Resources.assets.macos.icons.vscode,
    title: "File explorer",
    body: "Filesystem drag rule — drops resolve into the nearest folder. Drop-target highlight cascades through descendants.",
  },
  {
    icon: Resources.assets.macos.icons.notion,
    title: "Workspace sidebar",
    body: "Emoji-prefixed pages, nested toggles, drop-into-page. Selection wires the document body in three lines.",
  },
  {
    icon: Resources.assets.macos.icons.finder,
    title: "Native window",
    body: "Multi-column rows, zebra striping, double-click-to-expand — all consumer-side; the package never touches the markup.",
  },
];
