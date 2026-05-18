"use client";

import {
  TreeController,
  allOf,
  defaultKeymap,
  disallowDescendant,
  modeFromEvent,
  onlyIntoContainers,
  type Keymap,
  type Row,
  type TreeIntent,
} from "@grida/tree-view";
import { useTree, useTreeSnapshot } from "@grida/tree-view/react";
import { ChevronDownIcon, ChevronRightIcon, BoxIcon } from "lucide-react";
import * as React from "react";
import { ComponentDemo } from "../component-demo";
import { CustomSourcePanel } from "./_custom-source";
import {
  buildDeepFixture,
  buildLargeFixture,
  buildLayersFixture,
  type DemoMeta,
} from "./_fixtures";
import { DemoPanel, useDemoController } from "./_panel";
import {
  FigmaThemePanel,
  FinderThemePanel,
  GridaThemePanel,
  NotionThemePanel,
  VSCodeThemePanel,
} from "./_themes";
import {
  DecorationsPanel,
  ExternalDragPanel,
  FocusAfterDeletePanel,
  InlineRenamePanel,
  MultiSelectDragPanel,
  PersistedExpandedPanel,
  RevealPanel,
  TypeAheadPanel,
} from "./_recipes";
import { VirtualPanel } from "./_virtual-panel";

function useControllerForLayers(opts?: {
  constraint?: Parameters<typeof allOf>[0];
}) {
  return useDemoController(
    () =>
      new TreeController<DemoMeta>({
        source: buildLayersFixture(),
        constraint: opts?.constraint ? allOf(opts.constraint) : undefined,
        flatten: { reverseChildren: false },
        expanded: ["frame-1", "frame-1-content", "group-1"],
      })
  );
}

const graphicsKeymap: Keymap = {
  ...defaultKeymap,
  // Graphics-tool subset: arrow keys nudge on the canvas in the real
  // editor, so the tree view leaves left/right and up/down alone.
  ArrowUp: undefined,
  ArrowDown: undefined,
  ArrowLeft: undefined,
  ArrowRight: undefined,
};

export default function TreeViewDemoPage() {
  return (
    <main className="container max-w-screen-xl mx-auto py-10 space-y-12">
      <header className="space-y-5">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">@grida/tree-view</h1>
          <p className="text-gray-600 max-w-2xl">
            Headless, agnostic tree-view controller for editors and IDEs. Zero
            runtime dependencies, no DOM coupling in the core, no widget library
            on top. React is the only optional peer.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="https://www.npmjs.com/package/@grida/tree-view"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-zinc-200 bg-white text-xs font-medium hover:bg-zinc-50"
          >
            npm
          </a>
          <a
            href="https://github.com/gridaco/grida/tree/main/packages/grida-tree-view"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-zinc-200 bg-white text-xs font-medium hover:bg-zinc-50"
          >
            GitHub
          </a>
          <code className="inline-flex items-center h-8 px-3 rounded-md bg-zinc-100 text-xs font-mono text-zinc-700">
            pnpm add @grida/tree-view
          </code>
        </div>
      </header>

      <ThemedShowcase />

      <Section
        title="1. Plain hierarchy"
        description="Expand / collapse + single-select. Click a chevron to toggle, click a row to select."
      >
        <ComponentDemo className="!p-6">
          <PlainHierarchy />
        </ComponentDemo>
      </Section>

      <Section
        title="2. Multi-select"
        description="Replace (click), toggle (Cmd/Ctrl + click), range (Shift + click or Shift + ArrowUp/Down)."
      >
        <ComponentDemo className="!p-6">
          <MultiSelect />
        </ComponentDemo>
      </Section>

      <Section
        title="3. Keyboard navigation"
        description={
          <>
            Left panel: `defaultKeymap` installed (arrows + Home/End + Enter →
            rename intent + Delete → delete intent). Right panel: the
            graphics-tool subset — arrow keys are not bound, so they pass
            through to the host (in a real editor, they would nudge the canvas
            selection).
          </>
        }
      >
        <ComponentDemo className="!p-6">
          <KeyboardNav />
        </ComponentDemo>
      </Section>

      <Section
        title="4. Move constraints"
        description={
          <>
            `allOf(onlyIntoContainers(), disallowDescendant())`. Drag any row
            onto a leaf row: the drop is coerced to `after`. Drag a container
            onto itself or its descendant: the drop is refused.
          </>
        }
      >
        <ComponentDemo className="!p-6">
          <ConstraintsPanel />
        </ComponentDemo>
      </Section>

      <Section
        title="5. Move vs. copy drag"
        description={
          <>
            Drag a row to reorder. Hold `Alt` (Option on macOS) to switch the
            active drag to `copy`. Both intents are visualized below without
            mutating the source tree.
          </>
        }
      >
        <ComponentDemo className="!p-6">
          <MoveCopyPanel />
        </ComponentDemo>
      </Section>

      <Section
        title="6. Virtualized (~10,000 rows)"
        description={
          <>
            Demonstrates the recipe documented in the README: the package ships
            a stable flat row list; the demo wires it into
            `@tanstack/react-virtual`. The virtualizer is a consumer choice, not
            a runtime dependency of `@grida/tree-view`.
          </>
        }
      >
        <ComponentDemo className="!p-6">
          <VirtualizedPanel />
        </ComponentDemo>
      </Section>

      <Section
        title="7. Virtualized + deeply nested"
        description={
          <>
            100 chains × depth 100 = 10,000 rows, max indent at depth 99 (≈
            1,188 px from the row's left edge). The virtualizer handles row
            count; horizontal scroll is a pure consumer-side choice — the panel
            sets a `min-width` on the inner virtual canvas so the container
            scrolls both axes. Without that, indented rows would just truncate
            at the right edge.
          </>
        }
      >
        <ComponentDemo className="!p-6">
          <DeepVirtualizedPanel />
        </ComponentDemo>
      </Section>

      <Section
        title="8. Custom data source"
        description="A JSON tree adapted to TreeSource without copying — proves the package is data-agnostic."
      >
        <ComponentDemo className="!p-6">
          <CustomSourcePanel />
        </ComponentDemo>
      </Section>

      <section className="pt-12 mt-12 border-t border-zinc-200 space-y-3">
        <div className="space-y-2 max-w-3xl">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">
            <span className="inline-block size-1.5 rounded-full bg-amber-500" />
            Patterns & recipes
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            Common features, idiomatic wiring.
          </h2>
          <p className="text-zinc-600 text-sm leading-relaxed">
            Inline rename, focus restoration after delete, type-ahead, reveal in
            tree, external drag, decoration overlays, persisted expanded state —
            the patterns every real layer panel or file explorer needs. Each
            panel below shows how to wire the feature with the primitives the
            package ships.
          </p>
        </div>
      </section>

      <Section
        title="10. Inline rename"
        description={
          <>
            Focus a row, press <kbd>Enter</kbd> or <kbd>F2</kbd>. The package
            emits a <code>rename</code> intent; you mount the input and commit
            the new label to your source. Pass{" "}
            <code>
              keymap={"{"}editing ? null : defaultKeymap{"}"}
            </code>{" "}
            while editing so <kbd>Enter</kbd> commits the input instead of
            re-firing rename.
          </>
        }
      >
        <ComponentDemo className="!p-6">
          <InlineRenamePanel />
        </ComponentDemo>
      </Section>

      <Section
        title="11. Multi-select drag rule"
        description={
          <>
            Figma / VS Code / Finder convention: if the grabbed row is part of
            the current selection, drag the whole selection; otherwise drag just
            the row. One line in the pointer-down → <code>startDrag</code>{" "}
            bridge: <code>sel.includes(grabbedId) ? sel : [grabbedId]</code>.
          </>
        }
      >
        <ComponentDemo className="!p-6">
          <MultiSelectDragPanel />
        </ComponentDemo>
      </Section>

      <Section
        title="12. Focus restoration after delete"
        description={
          <>
            When you remove the focused row(s), focus should jump to the next
            visible sibling (or previous, or parent).{" "}
            <code>nextFocusAfterRemove(rows, ids)</code> picks the target from a
            pre-removal row snapshot — five lines on the consumer side.
          </>
        }
      >
        <ComponentDemo className="!p-6">
          <FocusAfterDeletePanel />
        </ComponentDemo>
      </Section>

      <Section
        title="13. Type-ahead search"
        description={
          <>
            Type a letter (or a sequence within ~500 ms) to jump focus to the
            first row whose label starts with the buffer — the WAI-ARIA tree
            pattern. <code>findByLabelPrefix(rows, prefix, opts)</code> handles
            the wrap-from-focus search; you keep the buffer (a short-lived
            string with an inactivity reset).
          </>
        }
      >
        <ComponentDemo className="!p-6">
          <TypeAheadPanel />
        </ComponentDemo>
      </Section>

      <Section
        title="14. Reveal-in-tree"
        description={
          <>
            "Go to file" / "Find in selection": expand ancestors, focus, select,
            and scroll into view. <code>controller.reveal(id, opts?)</code>{" "}
            covers the first three; DOM <code>scrollIntoView</code> is yours
            (the controller has no DOM handle).
          </>
        }
      >
        <ComponentDemo className="!p-6">
          <RevealPanel />
        </ComponentDemo>
      </Section>

      <Section
        title="15. Drag from outside (palette → tree)"
        description={
          <>
            Drag a chip from a side palette into the tree to create a new node.
            External payloads don't go through the controller's drag state
            (today); the consumer runs its own pointer loop and inserts into the
            source on drop. A first-class <code>startExternalDrag</code> API is
            on the roadmap.
          </>
        }
      >
        <ComponentDemo className="!p-6">
          <ExternalDragPanel />
        </ComponentDemo>
      </Section>

      <Section
        title="16. Decoration overlay"
        description={
          <>
            Badges (git status, problem counts, dirty markers) come from stores
            that change independently of the tree. Keep them in consumer-side
            state and read them in the row renderer — so shuffling badges never
            bumps <code>source.getVersion()</code>
            or invalidates the row list.
          </>
        }
      >
        <ComponentDemo className="!p-6">
          <DecorationsPanel />
        </ComponentDemo>
      </Section>

      <Section
        title="17. Controlled expanded set (persist to localStorage)"
        description={
          <>
            Expand / collapse state survives reload — hydrate from storage on
            mount, persist on every notify. <code>getExpanded()</code> /
            <code>setExpanded(ids)</code> and the <code>expanded</code>{" "}
            subscription channel are all the controller needs.
          </>
        }
      >
        <ComponentDemo className="!p-6">
          <PersistedExpandedPanel />
        </ComponentDemo>
      </Section>

      <Section
        title="18. Guides overlay (opt-in)"
        description={
          <>
            Default trees have no indent rails. When the consumer wants them —
            as a continuous rail through descendants of a special container (a
            mask group, a boolean op, etc.) — the rail is drawn as a single SVG
            overlay layered over the tree, not as per-row pieces. This keeps the
            line continuous across any row padding/gap and lets the consumer
            pick the symbol (vertical bar, ┌/└ corners, arrow markers,
            anything).
          </>
        }
      >
        <ComponentDemo className="!p-6">
          <GuidesPanel />
        </ComponentDemo>
      </Section>
    </main>
  );
}

function ThemedShowcase() {
  return (
    <section className="pt-12 mt-12 border-t border-zinc-200 space-y-10">
      <div className="space-y-3 max-w-3xl">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-zinc-500 uppercase tracking-wider">
          <span className="inline-block size-1.5 rounded-full bg-zinc-900" />
          Themed showcase
        </div>
        <h2 className="text-4xl font-bold tracking-tight">
          Same controller. Wildly different trees.
        </h2>
        <p className="text-zinc-600 leading-relaxed">
          The package never touches your DOM. Each panel below is{" "}
          <strong>identical wiring</strong> — same{" "}
          <code className="text-[13px] bg-zinc-100 px-1 rounded">
            TreeController
          </code>
          , same drag / keyboard / hit-test loop — composed against a different
          fixture, row renderer, indent geometry, and constraint stack. The
          result: a layers panel, a sidebar, a file explorer, and a
          double-click-to-open list view, all from one ~500-line core.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <ThemeCard
          name="Grida"
          summary="Monochrome zinc accent, eye + lock per row, full reorder drag."
        >
          <GridaThemePanel />
        </ThemeCard>
        <ThemeCard
          name="Figma"
          summary="Dark layers panel, components in purple, hidden layers dim, full reorder drag."
        >
          <FigmaThemePanel />
        </ThemeCard>
        <ThemeCard
          name="VS Code"
          summary="Filesystem semantics — drop is always *into* the nearest folder, target highlights in blue. No reordering."
        >
          <VSCodeThemePanel />
        </ThemeCard>
        <ThemeCard
          name="Notion"
          summary="Cream sidebar, emoji-prefixed pages, chevron on hover only. Drop into a page nests it; drag between pages to reorder."
        >
          <NotionThemePanel />
        </ThemeCard>
        <ThemeCard
          name="Finder (macOS)"
          summary="Multi-column grid, zebra rows, double-click to expand. Same FS drag rule as VS Code."
          wide
        >
          <FinderThemePanel />
        </ThemeCard>
      </div>
    </section>
  );
}

function ThemeCard({
  name,
  summary,
  wide,
  children,
}: {
  name: string;
  summary: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        "rounded-xl border border-zinc-200 bg-zinc-50/50 p-5 space-y-3",
        wide ? "xl:col-span-2" : "",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold">{name}</h3>
        <p className="text-xs text-zinc-500 max-w-md text-right">{summary}</p>
      </div>
      {children}
    </div>
  );
}

function GuidesPanel() {
  const controller = useControllerForLayers();
  return (
    <div className="w-full max-w-md">
      <DemoPanel controller={controller} keymap={defaultKeymap} guides />
    </div>
  );
}

function Section({
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
        <h2 className="text-xl font-semibold mb-1">{title}</h2>
        <p className="text-sm text-gray-600 max-w-2xl">{description}</p>
      </div>
      {children}
    </section>
  );
}

// ─── Panels ──────────────────────────────────────────────────────────────────

function PlainHierarchy() {
  const controller = useControllerForLayers();
  return (
    <div className="w-full max-w-md">
      <DemoPanel controller={controller} keymap={defaultKeymap} />
    </div>
  );
}

function MultiSelect() {
  const controller = useControllerForLayers();
  const selection = useSelectionStr(controller);
  return (
    <div className="w-full max-w-md space-y-2">
      <DemoPanel controller={controller} keymap={defaultKeymap} />
      <div className="text-xs text-gray-600">
        <span className="font-mono">{selection}</span>
      </div>
    </div>
  );
}

function KeyboardNav() {
  const leftController = useControllerForLayers();
  const rightController = useControllerForLayers();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
      <Labelled label="defaultKeymap">
        <DemoPanel controller={leftController} keymap={defaultKeymap} />
      </Labelled>
      <Labelled label="graphics-tool subset (no arrows)">
        <DemoPanel controller={rightController} keymap={graphicsKeymap} />
      </Labelled>
    </div>
  );
}

function ConstraintsPanel() {
  const controller = useControllerForLayers({
    constraint: allOf(onlyIntoContainers(), disallowDescendant()),
  });
  const [lastIntent, setLastIntent] = React.useState<TreeIntent | null>(null);
  return (
    <div className="w-full max-w-md space-y-2">
      <DemoPanel
        controller={controller}
        keymap={defaultKeymap}
        enableDrag
        onIntent={setLastIntent}
      />
      <IntentLog intent={lastIntent} />
    </div>
  );
}

function MoveCopyPanel() {
  const controller = useControllerForLayers();
  const [intents, setIntents] = React.useState<TreeIntent[]>([]);
  return (
    <div className="w-full max-w-md space-y-2">
      <DemoPanel
        controller={controller}
        keymap={defaultKeymap}
        enableDrag
        onIntent={(i) => setIntents((prev) => [i, ...prev].slice(0, 5))}
      />
      <div className="text-xs text-gray-600">
        Last intents (newest first). Hold `Alt`/`Option` while dragging to flip
        to `copy`.
      </div>
      <ul className="text-xs font-mono space-y-1">
        {intents.map((i, idx) => (
          <li key={idx} className="text-gray-700">
            {summarizeIntent(i)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function VirtualizedPanel() {
  const { controller, count } = React.useMemo(() => {
    const fix = buildLargeFixture(10000);
    const ctrl = new TreeController<DemoMeta>({
      // Cast: the large fixture only sets `label`; the tree-view doesn't
      // care about the kind, but the demo row does. Treat missing kind as
      // "rect" so the icon renders.
      source: fix.source as unknown as TreeController<DemoMeta>["source"],
      expanded: fix.rootChildren,
    });
    return { controller: ctrl, count: 10000 };
  }, []);
  React.useEffect(() => () => controller.dispose(), [controller]);
  return (
    <div className="w-full max-w-md space-y-2">
      <VirtualPanel controller={controller} />
      <div className="text-xs text-gray-600">
        ~{count.toLocaleString()} rows total, every group pre-expanded.
        Scrolling renders only the visible window.
      </div>
    </div>
  );
}

function DeepVirtualizedPanel() {
  const { controller, count, maxDepth, minInnerWidth } = React.useMemo(() => {
    const fix = buildDeepFixture({ groups: 100, depth: 100 });
    const ctrl = new TreeController<DemoMeta>({
      source: fix.source as unknown as TreeController<DemoMeta>["source"],
      expanded: fix.expanded,
    });
    // Spacer width = 4 + depth × 12. Reserve another ~220 px for the
    // sticky content cluster. With depth 99 the deepest row reaches
    // ≈ 4 + 99×12 + 220 = 1412 px.
    const inner = 4 + fix.maxDepth * 12 + 220;
    return {
      controller: ctrl,
      count: fix.total,
      maxDepth: fix.maxDepth,
      minInnerWidth: inner,
    };
  }, []);
  React.useEffect(() => () => controller.dispose(), [controller]);
  return (
    <div className="w-full max-w-md space-y-2">
      <VirtualPanel
        controller={controller}
        minInnerWidth={minInnerWidth}
        renderRow={(row, meta) => <FigmaDeepRow row={row} meta={meta} />}
      />
      <div className="text-xs text-gray-600">
        {count.toLocaleString()} rows, max depth {maxDepth}. The row is split
        into an indent <em>spacer</em> and a <code>position: sticky</code>{" "}
        content cluster — the cluster floats at the right edge of the visible
        viewport until the indent scrolls far enough that the natural position
        catches up (Figma layers-panel pattern).
      </div>
    </div>
  );
}

/**
 * Figma-style deep row: an indent *spacer* defines the natural row
 * width, and a `position: sticky; right: 0` *content cluster* keeps the
 * chevron + icon + label visible even when the natural position is
 * scrolled off the right edge. Pure CSS — the SDK ships no row
 * components.
 */
function FigmaDeepRow({ row, meta }: { row: Row; meta: DemoMeta | undefined }) {
  const controller = useTree<DemoMeta>();
  const selected = useTreeSnapshot((c) => c.getSelection().includes(row.id));
  const label = meta?.label ?? row.id;
  const indentPx = 4 + row.depth * 12;
  return (
    <div
      data-tree-row-id={row.id}
      data-row-depth={row.depth}
      data-state={selected ? "selected" : "idle"}
      role="treeitem"
      aria-selected={selected}
      onClick={(e) => {
        controller.focus(row.id);
        controller.select([row.id], modeFromEvent(e));
      }}
      className="relative flex h-7 items-center text-xs select-none cursor-default data-[state=selected]:bg-blue-100 data-[state=idle]:hover:bg-zinc-50"
    >
      {/* Spacer — defines the row's natural width so the inner canvas
          extends past the container's right edge and horizontal scroll
          engages. No content, no events. */}
      <span aria-hidden style={{ width: indentPx, flexShrink: 0 }} />
      {/* Sticky cluster — floats to the right edge of the visible
          viewport whenever its natural x would be off-screen. The row's
          background paints across the entire absolutely-positioned row,
          so we don't need a separate mask on the cluster itself. Once
          the user scrolls far enough that the indent catches up, sticky
          releases and the cluster sits at its natural indented
          position. */}
      <span className="sticky right-0 inline-flex items-center gap-1 pr-2 pl-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (row.isContainer) controller.toggle(row.id);
          }}
          aria-hidden={!row.isContainer}
          className="inline-flex size-4 items-center justify-center text-zinc-400 hover:text-zinc-700"
        >
          {row.isContainer ? (
            row.isExpanded ? (
              <ChevronDownIcon className="size-3" />
            ) : (
              <ChevronRightIcon className="size-3" />
            )
          ) : null}
        </button>
        <BoxIcon className="size-3.5 text-zinc-500" />
        <span className="truncate whitespace-nowrap">{label}</span>
      </span>
    </div>
  );
}

// ─── tiny helpers ───────────────────────────────────────────────────────────

function Labelled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-500">{label}</div>
      {children}
    </div>
  );
}

function useSelectionStr(controller: TreeController<DemoMeta>) {
  const [str, setStr] = React.useState("(none)");
  React.useEffect(() => {
    const update = () => {
      const s = controller.getSelection();
      setStr(s.length === 0 ? "(none)" : `[${s.join(", ")}]`);
    };
    update();
    return controller.subscribe("selection", update);
  }, [controller]);
  return str;
}

function IntentLog({ intent }: { intent: TreeIntent | null }) {
  return (
    <div className="text-xs font-mono text-gray-700">
      {intent ? summarizeIntent(intent) : "no intent yet"}
    </div>
  );
}

function summarizeIntent(i: TreeIntent): string {
  switch (i.kind) {
    case "move":
    case "copy":
      return `${i.kind}([${i.items.join(", ")}]) → ${i.to.placement} ${i.to.over} (parent=${i.to.parent}, index=${i.to.index})`;
    case "rename":
      return `rename(${i.id})`;
    case "delete":
      return `delete([${i.ids.join(", ")}])`;
    case "activate":
      return `activate(${i.id})`;
  }
}
