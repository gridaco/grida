"use client";

import {
  FigmaShowcase,
  FinderShowcase,
  GridaShowcase,
  NotionShowcase,
  VSCodeAsyncShowcase,
  VSCodeShowcase,
} from "@/app/(dev)/ui/components/tree-view/_showcase";
import { CustomSourcePanel } from "@/app/(dev)/ui/components/tree-view/_custom-source";
import {
  ConstraintsPanel,
  DeepVirtualizedPanel,
  GuidesPanel,
  KeyboardNav,
  MoveCopyPanel,
  MultiSelect,
  PlainHierarchy,
  VirtualizedPanel,
} from "@/app/(dev)/ui/components/tree-view/_patterns";
import {
  DecorationsPanel,
  ExternalDragPanel,
  FocusAfterDeletePanel,
  InlineRenamePanel,
  MultiSelectDragPanel,
  PersistedExpandedPanel,
  RevealPanel,
  TypeAheadPanel,
} from "@/app/(dev)/ui/components/tree-view/_recipes";
import { ComponentDemo } from "@/app/(dev)/ui/components/component-demo";
import { RegistryExample } from "@/components/registry-example";
import { NpmLogo } from "@grida/react-icons/logos";
import { Button } from "@app/ui/components/button";
import { CopyToClipboardInput } from "@/components/copy-to-clipboard-input";
import { Resources } from "@/resources";
import Footer from "@/www/footer";
import Header from "@/www/header";
import { ArrowRightIcon } from "lucide-react";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import Link from "next/link";
import type * as React from "react";

const NPM_URL = "https://www.npmjs.com/package/@grida/tree-view";
const GITHUB_URL =
  "https://github.com/gridaco/grida/tree/main/packages/grida-tree-view";

export default function TreeViewLandingPage() {
  return (
    <main className="min-h-screen">
      <Header className="relative" />

      {/* Hero */}
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
            <Link href={NPM_URL} target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="outline">
                <NpmLogo className="size-8 mr-1" />
                npm
              </Button>
            </Link>
            <Link href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="outline">
                <GitHubLogoIcon className="size-4 mr-2" />
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
      <VSCodeAsyncShowcase />
      <NotionShowcase />
      <FinderShowcase />

      {/* Quick start — live Preview / Code tabs, mirroring shadcn-ui's
          example pattern. The pitch sits beside the example on md+, stacks
          below on smaller viewports. */}
      <section className="container mx-auto px-4 py-16 border-t border-zinc-200">
        <div className="max-w-5xl mx-auto grid gap-8 md:grid-cols-[1fr_1.4fr] md:items-center md:gap-12">
          <div className="space-y-4">
            <h2 className="text-3xl font-bold tracking-tight">Quick start</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              One source, one controller, one provider. The package owns
              expansion, selection and drag math; you render the rows with
              whatever markup you want.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <div className="w-full max-w-xs">
                <CopyToClipboardInput value="npx shadcn@latest add https://grida.co/r/tree-view-row.json" />
              </div>
            </div>
            <Link href={NPM_URL} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <NpmLogo className="size-6 mr-1" />
                View on npm
                <ArrowRightIcon className="size-3.5 ml-1.5" />
              </Button>
            </Link>
          </div>
          <RegistryExample
            name="examples/tree-view/quick-start"
            codeFrom="examples/tree-view/quick-start-lite"
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

      {/* Examples — every controller capability with a live demo. */}
      <section className="container mx-auto px-4 py-16 border-t border-zinc-200">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="max-w-3xl space-y-1">
            <h2 className="text-3xl font-bold tracking-tight">Examples</h2>
            <p className="text-sm text-muted-foreground">
              Selection, drag, keyboard, virtualization, custom sources.
            </p>
          </div>

          <PatternSection
            title="1. Plain hierarchy"
            description="Expand / collapse + single-select. Click a chevron to toggle, click a row to select."
          >
            <PlainHierarchy />
          </PatternSection>

          <PatternSection
            title="2. Multi-select"
            description="Replace (click), toggle (Cmd/Ctrl + click), range (Shift + click or Shift + ArrowUp/Down)."
          >
            <MultiSelect />
          </PatternSection>

          <PatternSection
            title="3. Keyboard navigation"
            description={
              <>
                Left panel: <code>defaultKeymap</code> installed (arrows +
                Home/End + Enter → rename intent + Delete → delete intent).
                Right panel: the graphics-tool subset — arrow keys are not
                bound, so they pass through to the host (in a real editor, they
                would nudge the canvas selection).
              </>
            }
          >
            <KeyboardNav />
          </PatternSection>

          <PatternSection
            title="4. Move constraints"
            description={
              <>
                <code>allOf(onlyIntoContainers(), disallowDescendant())</code>.
                Drag any row onto a leaf row: the drop is coerced to{" "}
                <code>after</code>. Drag a container onto itself or its
                descendant: the drop is refused.
              </>
            }
          >
            <ConstraintsPanel />
          </PatternSection>

          <PatternSection
            title="5. Move vs. copy drag"
            description={
              <>
                Drag a row to reorder. Hold <kbd>Alt</kbd> (<kbd>Option</kbd> on
                macOS) to switch the active drag to <code>copy</code>. Both
                intents are visualized below without mutating the source tree.
              </>
            }
          >
            <MoveCopyPanel />
          </PatternSection>

          <PatternSection
            title="6. Virtualized (~10,000 rows)"
            description={
              <>
                Demonstrates the recipe documented in the README: the package
                ships a stable flat row list; the demo wires it into{" "}
                <code>@tanstack/react-virtual</code>. The virtualizer is a
                consumer choice, not a runtime dependency of{" "}
                <code>@grida/tree-view</code>.
              </>
            }
          >
            <VirtualizedPanel />
          </PatternSection>

          <PatternSection
            title="7. Virtualized + deeply nested"
            description={
              <>
                100 chains × depth 100 = 10,000 rows, max indent at depth 99 (≈
                1,188 px from the row's left edge). The virtualizer handles row
                count; horizontal scroll is a pure consumer-side choice — the
                panel sets a <code>min-width</code> on the inner virtual canvas
                so the container scrolls both axes. Without that, indented rows
                would just truncate at the right edge.
              </>
            }
          >
            <DeepVirtualizedPanel />
          </PatternSection>

          <PatternSection
            title="8. Custom data source"
            description="A JSON tree adapted to TreeSource without copying — proves the package is data-agnostic."
          >
            <CustomSourcePanel />
          </PatternSection>
        </div>
      </section>

      {/* Recipes — idiomatic wiring for the patterns every real layer panel
          or file explorer needs. */}
      <section className="container mx-auto px-4 pt-16 pb-32 border-t border-zinc-200 md:pb-40">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="max-w-3xl space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">
              <span className="inline-block size-1.5 rounded-full bg-amber-500" />
              Recipes
            </div>
            <h2 className="text-3xl font-bold tracking-tight">
              Common features, idiomatic wiring.
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Inline rename, focus restoration after delete, type-ahead, reveal
              in tree, external drag, decoration overlays, persisted expanded
              state — the patterns every real layer panel or file explorer
              needs.
            </p>
          </div>

          <PatternSection
            title="Inline rename"
            description={
              <>
                Focus a row, press <kbd>Enter</kbd> or <kbd>F2</kbd>. The
                package emits a <code>rename</code> intent; you mount the input
                and commit the new label to your source. Pass{" "}
                <code>
                  keymap={"{"}editing ? null : defaultKeymap{"}"}
                </code>{" "}
                while editing so <kbd>Enter</kbd> commits the input instead of
                re-firing rename.
              </>
            }
          >
            <InlineRenamePanel />
          </PatternSection>

          <PatternSection
            title="Multi-select drag rule"
            description={
              <>
                Figma / VS Code / Finder convention: if the grabbed row is part
                of the current selection, drag the whole selection; otherwise
                drag just the row. One line in the pointer-down →{" "}
                <code>startDrag</code> bridge:{" "}
                <code>sel.includes(grabbedId) ? sel : [grabbedId]</code>.
              </>
            }
          >
            <MultiSelectDragPanel />
          </PatternSection>

          <PatternSection
            title="Focus restoration after delete"
            description={
              <>
                When you remove the focused row(s), focus should jump to the
                next visible sibling (or previous, or parent).{" "}
                <code>nextFocusAfterRemove(rows, ids)</code> picks the target
                from a pre-removal row snapshot — five lines on the consumer
                side.
              </>
            }
          >
            <FocusAfterDeletePanel />
          </PatternSection>

          <PatternSection
            title="Type-ahead search"
            description={
              <>
                Type a letter (or a sequence within ~500 ms) to jump focus to
                the first row whose label starts with the buffer — the WAI-ARIA
                tree pattern. <code>findByLabelPrefix(rows, prefix, opts)</code>{" "}
                handles the wrap-from-focus search; you keep the buffer (a
                short-lived string with an inactivity reset).
              </>
            }
          >
            <TypeAheadPanel />
          </PatternSection>

          <PatternSection
            title="Reveal-in-tree"
            description={
              <>
                "Go to file" / "Find in selection": expand ancestors, focus,
                select, and scroll into view.{" "}
                <code>controller.reveal(id, opts?)</code> covers the first
                three; DOM <code>scrollIntoView</code> is yours (the controller
                has no DOM handle).
              </>
            }
          >
            <RevealPanel />
          </PatternSection>

          <PatternSection
            title="Drag from outside (palette → tree)"
            description={
              <>
                Drag a chip from a side palette into the tree to create a new
                node. External payloads don't go through the controller's drag
                state (today); the consumer runs its own pointer loop and
                inserts into the source on drop. A first-class{" "}
                <code>startExternalDrag</code> API is on the roadmap.
              </>
            }
          >
            <ExternalDragPanel />
          </PatternSection>

          <PatternSection
            title="Decoration overlay"
            description={
              <>
                Badges (git status, problem counts, dirty markers) come from
                stores that change independently of the tree. Keep them in
                consumer-side state and read them in the row renderer — so
                shuffling badges never bumps <code>source.getVersion()</code> or
                invalidates the row list.
              </>
            }
          >
            <DecorationsPanel />
          </PatternSection>

          <PatternSection
            title="Controlled expanded set (persist to localStorage)"
            description={
              <>
                Expand / collapse state survives reload — hydrate from storage
                on mount, persist on every notify. <code>getExpanded()</code> /{" "}
                <code>setExpanded(ids)</code> and the <code>expanded</code>{" "}
                subscription channel are all the controller needs.
              </>
            }
          >
            <PersistedExpandedPanel />
          </PatternSection>

          <PatternSection
            title="Guides overlay (opt-in)"
            description={
              <>
                Default trees have no indent rails. When the consumer wants them
                — as a continuous rail through descendants of a special
                container (a mask group, a boolean op, etc.) — the rail is drawn
                as a single SVG overlay layered over the tree, not as per-row
                pieces. This keeps the line continuous across any row
                padding/gap and lets the consumer pick the symbol.
              </>
            }
          >
            <GuidesPanel />
          </PatternSection>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function PatternSection({
  title,
  description,
  children,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xl font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-2xl">{description}</p>
      </div>
      <ComponentDemo className="!p-6">{children}</ComponentDemo>
    </section>
  );
}

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
