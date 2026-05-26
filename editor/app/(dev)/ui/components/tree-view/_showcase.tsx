"use client";

// ───────────────────────────────────────────────────────────────────────────
// Synced-editor showcase. Each section is `[ tree view ]   ·space·   [ editor ]`.
// Grida and Figma sections mount the real `@grida/svg-editor`; the layers
// panel is a tree-view bound to the editor's tree via `useSvgTreeController`.
// VS Code, Notion, and Finder use an in-memory `TreeSource` with the
// `applyIntent` bridge — the tree mutates its own source and a mock editor
// pane reflects selection.
// ───────────────────────────────────────────────────────────────────────────

import { modeFromEvent, TreeController, type NodeId } from "@grida/tree-view";
import { TreeProvider, useTree, useTreeSnapshot } from "@grida/tree-view/react";
import {
  SvgEditorCanvas,
  SvgEditorProvider,
  useEditorState,
  useHoverOverride,
} from "@grida/svg-editor/react";
import {
  MacOSDesktop,
  MacOSDock,
  MacOSMenuBar,
  MacOSWindow,
} from "@/components/frames/macos-desktop";
import { Resources } from "@/resources";
import Image from "next/image";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CommandIcon,
  FileCode2Icon,
  SearchIcon,
  SettingsIcon,
  TerminalIcon,
} from "lucide-react";
import * as React from "react";
import {
  buildFinderFixture,
  buildNotionFixture,
  buildVSCodeFixture,
  type DemoMeta,
} from "./_fixtures";
import { DemoPanel, type RenderRowArgs } from "./_panel";
import {
  applyIntent,
  FinderRow,
  fsConstraint,
  NotionRow,
  useThemeController,
  VSCodeRow,
} from "./_themes";
import {
  useSvgTreeController,
  type SvgNodeMeta,
} from "@/app/(canvas)/svg/_components/use-svg-tree";
import { useSurfaceHover } from "@/app/(canvas)/svg/_components/use-surface-hover";
import { tagInfo } from "@/app/(canvas)/svg/_components/node-type-map";

// ───────────────────────────────────────────────────────────────────────────
// Section scaffold — one consistent header + a tree | gap | editor grid so
// every demo lines up vertically regardless of its chrome.
// ───────────────────────────────────────────────────────────────────────────

function SectionHeader({
  eyebrow,
  icon,
  iconAlt,
  children,
}: {
  eyebrow: string;
  /** App icon path (e.g. `Resources.assets.macos.icons.grida`). Replaces the headline. */
  icon: string;
  iconAlt: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
      <Image
        src={icon}
        alt={iconAlt}
        width={64}
        height={64}
        draggable={false}
        className="size-14 shrink-0 select-none drop-shadow-md md:size-16"
      />
      <div className="max-w-md space-y-1.5">
        <div className="text-[13px] font-semibold text-zinc-900">{eyebrow}</div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {children}
        </p>
      </div>
    </div>
  );
}

/**
 * Outer 16:9 card that hosts a `[tree | demo]` split. The card itself owns
 * the aspect ratio + the soft background; the tree and demo panes "float"
 * inside on a small inner padding, keeping their own borders/shadows. On
 * smaller viewports the card collapses to a stacked column with explicit
 * heights so neither pane vanishes.
 */
function SplitStage({
  tree,
  editor,
  frame,
}: {
  tree: React.ReactNode;
  editor: React.ReactNode;
  /** Tailwind classes for the outer card background + ring. */
  frame?: string;
}) {
  // Nested radius: outer rounded-2xl (16px) = inner pane rounded-lg (8px)
  // + p-2 padding (8px), so the inner corners sit concentric with the
  // outer card. Each showcase applies rounded-lg to its tree/demo chrome.
  return (
    <div
      className={[
        "rounded-2xl p-2 sm:aspect-[16/9]",
        frame ?? "bg-zinc-100 ring-1 ring-zinc-200/70",
      ].join(" ")}
    >
      <div className="flex h-full flex-col gap-2 sm:flex-row">
        <div className="w-full sm:h-full sm:w-44 sm:shrink-0 md:w-56">
          {tree}
        </div>
        <div className="min-w-0 flex-1 sm:h-full">{editor}</div>
      </div>
    </div>
  );
}

// Heights used on small/mid viewports where the 16:9 frame doesn't apply
// (stacked column). On lg+ children get `h-full` from the aspect-ratio
// parent instead.
const STAGE_H = "h-[420px] sm:h-full";

// ───────────────────────────────────────────────────────────────────────────
// Activity card SVG opened by `SvgEditorProvider` for the Grida and Figma
// showcases.
// ───────────────────────────────────────────────────────────────────────────

const ACTIVITY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="440" viewBox="0 0 320 440" font-family="ui-sans-serif, system-ui, -apple-system, Inter, sans-serif">
  <g id="cover">
    <rect id="cover-bg" x="0" y="0" width="320" height="440" rx="20" fill="#FFFFFF"/>
    <text id="eyebrow" x="24" y="40" font-size="11" font-weight="600" fill="#94A3B8" letter-spacing="0.2">ACTIVITY</text>
    <text id="hero" x="24" y="94" font-size="36" font-weight="700" fill="#0F172A">1,284</text>
    <text id="delta" x="24" y="124" font-size="12" font-weight="500" fill="#10B981">+18% vs last week</text>
    <rect id="divider" x="24" y="148" width="272" height="1" fill="#E2E8F0"/>
    <g id="items">
      <g id="item-commits">
        <circle id="dot-commits" cx="32" cy="184" r="4" fill="#6366F1"/>
        <text id="label-commits" x="46" y="188" font-size="14" font-weight="500" fill="#0F172A">Commits</text>
        <text id="value-commits" x="296" y="188" font-size="14" font-weight="600" fill="#0F172A" text-anchor="end">24</text>
      </g>
      <g id="item-reviews">
        <circle id="dot-reviews" cx="32" cy="232" r="4" fill="#F59E0B"/>
        <text id="label-reviews" x="46" y="236" font-size="14" font-weight="500" fill="#0F172A">Reviews</text>
        <text id="value-reviews" x="296" y="236" font-size="14" font-weight="600" fill="#0F172A" text-anchor="end">8</text>
      </g>
      <g id="item-releases">
        <circle id="dot-releases" cx="32" cy="280" r="4" fill="#10B981"/>
        <text id="label-releases" x="46" y="284" font-size="14" font-weight="500" fill="#0F172A">Releases</text>
        <text id="value-releases" x="296" y="284" font-size="14" font-weight="600" fill="#0F172A" text-anchor="end">2</text>
      </g>
    </g>
    <g id="action">
      <rect id="button-bg" x="24" y="372" width="272" height="44" rx="10" fill="#0F172A"/>
      <text id="button-label" x="160" y="400" font-size="14" font-weight="600" fill="#FFFFFF" text-anchor="middle">View report →</text>
    </g>
  </g>
</svg>`;

// ───────────────────────────────────────────────────────────────────────────
// Tone bundles — everything that forks between the Grida and Figma showcases
// lives here. The shell, row, auto-reveal, and canvas pane are all shared.
// ───────────────────────────────────────────────────────────────────────────

type SvgRowTone = {
  /** Outer row className — colors, text size, data-state variants. */
  outer: string;
  /** Row height utility (`h-7`, `h-6`, …). */
  height: string;
  /** Chevron button container className. */
  chevronContainer: string;
  /** `(selected) => className` for the chevron arrow. */
  chevron: (selected: boolean) => string;
  /** Leading icon size utility. */
  iconSize: string;
  /** `(selected) => className` for the leading icon color. */
  iconColor: (selected: boolean) => string;
  indentBase: number;
  indentStep: number;
};

type ShowcaseTone = {
  eyebrow: string;
  icon: string;
  iconAlt: string;
  intro: React.ReactNode;
  providerStyle: { chrome_color: string; handle_stroke: string };
  /** Outer SplitStage card background. */
  frame: string;
  /** Layers panel container chrome. */
  treeChrome: string;
  /** Optional header above the rows (Figma's "Layers / Cover" bar). */
  treeHeader?: React.ReactNode;
  /** DemoPanel className overrides (background tint, ...). */
  panelClass: string;
  /** Canvas backdrop tone. */
  stageTone: "light" | "dark";
  row: SvgRowTone;
};

const GRIDA_TONE: ShowcaseTone = {
  eyebrow: "Grida",
  icon: Resources.assets.macos.icons.grida,
  iconAlt: "Grida",
  intro: (
    <>
      The real{" "}
      <code className="rounded bg-zinc-100 px-1 text-[12px]">
        @grida/svg-editor
      </code>{" "}
      drives the canvas. The layers panel is a tree-view bound to that editor's
      tree — select or hover on either side and the other follows.
    </>
  ),
  providerStyle: { chrome_color: "#18181B", handle_stroke: "#18181B" },
  frame: "bg-zinc-100 ring-1 ring-zinc-200/70",
  treeChrome: "rounded-lg border border-zinc-200 bg-white p-1 shadow-sm",
  panelClass: "min-h-0 flex-1 !border-0",
  stageTone: "light",
  row: {
    outer:
      "group/row relative flex items-center gap-1.5 px-2 text-[12px] select-none cursor-default rounded-sm transition-colors data-[state=selected]:bg-zinc-900 data-[state=selected]:text-white data-[state=focused]:bg-zinc-100 data-[state=hovered]:bg-zinc-100 data-[state=idle]:hover:bg-zinc-50",
    height: "h-7",
    chevronContainer: "inline-flex size-4 items-center justify-center",
    chevron: (selected) =>
      selected ? "text-white/80" : "text-zinc-400 hover:text-zinc-700",
    iconSize: "size-3.5",
    iconColor: (selected) => (selected ? "text-white" : "text-zinc-500"),
    indentBase: 6,
    indentStep: 14,
  },
};

const FIGMA_TONE: ShowcaseTone = {
  eyebrow: "Figma",
  icon: Resources.assets.macos.icons.figma,
  iconAlt: "Figma",
  intro: (
    <>
      Same editor, same bridge — only the panel chrome and the editor's chrome
      color change. The layers panel still walks the editor's tree.
    </>
  ),
  providerStyle: { chrome_color: "#0D99FF", handle_stroke: "#0D99FF" },
  frame: "bg-[#141417] ring-1 ring-white/5",
  treeChrome:
    "overflow-hidden rounded-lg border border-neutral-700 bg-[#2C2C2C] shadow-lg",
  treeHeader: (
    <div className="flex items-center justify-between border-b border-neutral-700/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-400">
      <span>Layers</span>
      <span className="text-neutral-500">Cover</span>
    </div>
  ),
  panelClass: "min-h-0 flex-1 !border-0 !bg-[#2C2C2C]",
  stageTone: "dark",
  row: {
    outer:
      "group/row relative flex items-center gap-1.5 px-2 text-[11px] select-none cursor-default text-neutral-200 data-[state=selected]:bg-[#0D99FF] data-[state=selected]:text-white data-[state=focused]:bg-white/10 data-[state=focused]:text-neutral-100 data-[state=hovered]:bg-white/5 data-[state=idle]:hover:bg-white/5",
    height: "h-6",
    chevronContainer: "inline-flex size-3 items-center justify-center",
    chevron: (selected) =>
      selected ? "text-white/90" : "text-neutral-400 hover:text-neutral-100",
    iconSize: "size-3.5",
    iconColor: (selected) => (selected ? "text-white" : "text-neutral-300"),
    indentBase: 8,
    indentStep: 16,
  },
};

// ───────────────────────────────────────────────────────────────────────────
// Auto-reveal — expand ancestors and scroll the row for the canvas's first
// selection. Scoped via `closest("section")` because Grida and Figma share
// node ids and a document-wide query would scroll the wrong panel.
// ───────────────────────────────────────────────────────────────────────────

function useAutoRevealSelection(
  controller: TreeController<SvgNodeMeta>,
  scopeRef: React.RefObject<HTMLElement | null>
): void {
  const firstSelected = useEditorState((s) => s.selection[0] ?? null);
  const lastRevealed = React.useRef<NodeId | null>(null);
  React.useEffect(() => {
    if (firstSelected === null || firstSelected === lastRevealed.current)
      return;
    lastRevealed.current = firstSelected;
    controller.expandTo(firstSelected);
    const scope = scopeRef.current?.closest("section") ?? document;
    const raf = requestAnimationFrame(() => {
      scope
        .querySelector<HTMLElement>(
          `[data-tree-row-id="${CSS.escape(firstSelected)}"]`
        )
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [firstSelected, controller, scopeRef]);
}

// ───────────────────────────────────────────────────────────────────────────
// Row renderer — reads SVG meta from the bridged source, paints the icon
// from `tagInfo`, and bridges hover via the editor's surface-hover channel
// so hovering a row highlights the shape (and vice versa). Drag-reorder and
// visibility/lock flags are intentionally out: the demo proves canvas↔panel
// sync, not a tree-driven SVG editor.
// ───────────────────────────────────────────────────────────────────────────

type RowSnapshot = {
  meta: SvgNodeMeta | undefined;
  selected: boolean;
  focused: boolean;
  label: string;
};

const rowSnapshotEq = (a: RowSnapshot, b: RowSnapshot): boolean =>
  a.meta === b.meta &&
  a.selected === b.selected &&
  a.focused === b.focused &&
  a.label === b.label;

function SvgRow({ args, tone }: { args: RenderRowArgs; tone: SvgRowTone }) {
  const { row } = args;
  const controller = useTree<SvgNodeMeta>();
  const { meta, selected, focused, label } = useTreeSnapshot<
    SvgNodeMeta,
    RowSnapshot
  >((c) => {
    const node = c.source.getNode(row.id);
    return {
      meta: node.meta,
      selected: c.getSelection().includes(row.id),
      focused: c.getFocused() === row.id,
      label: c.source.getLabel?.(row.id) ?? row.id,
    };
  }, rowSnapshotEq);
  const hoverId = useSurfaceHover();
  const setHover = useHoverOverride();
  const hovered = hoverId === row.id;
  const Icon = tagInfo(meta?.tag ?? "").Icon;

  let state: "selected" | "focused" | "hovered" | "idle" = "idle";
  if (selected) state = "selected";
  else if (focused) state = "focused";
  else if (hovered) state = "hovered";

  return (
    <div
      data-tree-row-id={row.id}
      data-row-depth={row.depth}
      data-state={state}
      role="treeitem"
      aria-selected={selected}
      tabIndex={-1}
      onClick={(e) => {
        controller.focus(row.id);
        controller.select([row.id], modeFromEvent(e));
      }}
      onPointerEnter={() => setHover(row.id)}
      onPointerLeave={() => setHover(null)}
      className={`${tone.outer} ${tone.height}`}
      style={{ paddingLeft: tone.indentBase + row.depth * tone.indentStep }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (row.isContainer) controller.toggle(row.id);
        }}
        aria-hidden={!row.isContainer}
        className={`${tone.chevronContainer} ${tone.chevron(selected)}`}
      >
        {row.isContainer ? (
          row.isExpanded ? (
            <ChevronDownIcon className="size-3" />
          ) : (
            <ChevronRightIcon className="size-3" />
          )
        ) : null}
      </button>
      <Icon className={`${tone.iconSize} ${tone.iconColor(selected)}`} />
      <span className="truncate flex-1">{label}</span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// One showcase shell, two themes. Adding a third (e.g. Sketch) is a new
// `ShowcaseTone` and a `<SvgShowcase tone={...} />` call.
// ───────────────────────────────────────────────────────────────────────────

function SvgShowcase({ tone }: { tone: ShowcaseTone }) {
  return (
    <section className="border-t border-zinc-200 py-16">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeader
          eyebrow={tone.eyebrow}
          icon={tone.icon}
          iconAlt={tone.iconAlt}
        >
          {tone.intro}
        </SectionHeader>
        <SvgEditorProvider initialSvg={ACTIVITY_SVG} style={tone.providerStyle}>
          <SvgShowcaseBody tone={tone} />
        </SvgEditorProvider>
      </div>
    </section>
  );
}

function SvgShowcaseBody({ tone }: { tone: ShowcaseTone }) {
  const controller = useSvgTreeController();
  const scopeRef = React.useRef<HTMLDivElement>(null);
  useAutoRevealSelection(controller, scopeRef);
  return (
    <div ref={scopeRef}>
      <SplitStage
        frame={tone.frame}
        tree={
          <div className={`flex ${STAGE_H} flex-col ${tone.treeChrome}`}>
            {tone.treeHeader}
            <DemoPanel
              controller={controller as unknown as TreeController<DemoMeta>}
              indentBase={tone.row.indentBase}
              indentStep={tone.row.indentStep}
              className={tone.panelClass}
              renderRow={(args) => <SvgRow args={args} tone={tone.row} />}
            />
          </div>
        }
        editor={<SvgStage tone={tone.stageTone} />}
      />
    </div>
  );
}

export function GridaShowcase() {
  return <SvgShowcase tone={GRIDA_TONE} />;
}

export function FigmaShowcase() {
  return <SvgShowcase tone={FIGMA_TONE} />;
}

// ───────────────────────────────────────────────────────────────────────────
// Canvas pane — dotted-grid backdrop + footer tip around `<SvgEditorCanvas>`.
// The container is exclusively owned by the surface (per editor docs); the
// backdrop and footer are siblings, not children of the canvas div.
// ───────────────────────────────────────────────────────────────────────────

function SvgStage({ tone }: { tone: "light" | "dark" }) {
  const dark = tone === "dark";
  return (
    <div
      className={[
        "relative flex flex-col overflow-hidden rounded-lg border",
        STAGE_H,
        dark ? "border-neutral-800 bg-[#1B1B1F]" : "border-zinc-200 bg-zinc-50",
      ].join(" ")}
      style={{
        backgroundImage: `radial-gradient(${
          dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)"
        } 1px, transparent 1px)`,
        backgroundSize: "16px 16px",
      }}
    >
      <SvgEditorCanvas fit className="absolute inset-0" />
      <p
        className={[
          "pointer-events-none absolute inset-x-0 bottom-0 border-t px-3 py-2 text-center text-[11px] backdrop-blur-sm",
          dark
            ? "border-neutral-800 bg-[#1B1B1F]/70 text-neutral-500"
            : "border-zinc-200/70 bg-white/60 text-zinc-500",
        ].join(" ")}
      >
        Click a shape · drag handles · ⌫ to delete
      </p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// VS Code — explorer + empty-state editor pane
// ───────────────────────────────────────────────────────────────────────────

const VSCODE_COMMANDS: {
  label: string;
  keys: string;
  Icon: typeof CommandIcon;
}[] = [
  { label: "Show All Commands", keys: "⇧⌘P", Icon: CommandIcon },
  { label: "Go to File", keys: "⌘P", Icon: FileCode2Icon },
  { label: "Find in Files", keys: "⇧⌘F", Icon: SearchIcon },
  { label: "Toggle Terminal", keys: "⌃`", Icon: TerminalIcon },
  { label: "Open Settings", keys: "⌘,", Icon: SettingsIcon },
];

function VSCodeEmptyEditor() {
  const sel = useTreeSnapshot<DemoMeta, NodeId | null>(
    (c) => c.getSelection()[0] ?? null
  );
  const controller = useTree<DemoMeta>();
  useTreeSnapshot<DemoMeta, number>((c) => c.source.getVersion());

  let openFile: { name: string } | null = null;
  if (sel) {
    try {
      const node = controller.source.getNode(sel);
      if (node.meta?.kind !== "folder") {
        openFile = { name: node.meta?.label ?? String(sel) };
      }
    } catch {
      openFile = null;
    }
  }

  return (
    <div
      className={`flex ${STAGE_H} flex-col overflow-hidden rounded-lg border border-[#3C3C3C] bg-[#1E1E1E] font-mono shadow-lg`}
    >
      {openFile ? (
        <>
          <div className="flex h-9 items-center border-b border-[#2A2A2A] bg-[#252526] text-[12px]">
            <div className="flex h-full items-center gap-2 border-r border-[#2A2A2A] bg-[#1E1E1E] px-3 text-[#CCCCCC]">
              <FileCode2Icon className="size-3.5 text-[#61DAFB]" />
              <span>{openFile.name}</span>
              <span className="ml-1 size-2 rounded-full bg-[#CCCCCC]/50" />
            </div>
          </div>
          <div className="flex flex-1 overflow-hidden text-[12px] leading-6">
            <div className="select-none px-3 py-3 text-right text-[#5A5A5A]">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <pre className="flex-1 overflow-auto py-3 pr-4 text-[#CCCCCC]">
              <span className="text-[#6A9955]">
                {"// " + openFile.name}
                {"\n"}
                {"// opened from the explorer tree\n"}
              </span>
              <span className="text-[#C586C0]">const</span>{" "}
              <span className="text-[#9CDCFE]">selected</span> ={" "}
              <span className="text-[#CE9178]">controller.getSelection()</span>;
              {"\n"}
              <span className="text-[#6A9955]">
                {"// one TreeController, two surfaces"}
              </span>
            </pre>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-7 px-6">
          <div className="text-center">
            <div className="font-mono text-3xl font-bold tracking-tight text-[#3C3C3C]">
              @grida/tree-view
            </div>
            <div className="mt-1 text-[12px] text-[#6A6A6A]">
              Select a file in the explorer to open it
            </div>
          </div>
          <div className="w-full max-w-xs space-y-1.5">
            {VSCODE_COMMANDS.map((c) => (
              <div
                key={c.label}
                className="flex items-center justify-between text-[12px]"
              >
                <span className="flex items-center gap-2 text-[#9DA5B4]">
                  <c.Icon className="size-3.5" />
                  {c.label}
                </span>
                <kbd className="rounded border border-[#3C3C3C] bg-[#2A2A2A] px-1.5 py-0.5 text-[11px] text-[#9DA5B4]">
                  {c.keys}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function VSCodeShowcase() {
  const controller = useThemeController(buildVSCodeFixture, {
    expanded: ["src", "src-components", "src-app", "src-lib", "public"],
    constraint: fsConstraint,
  });

  return (
    <section className="border-t border-zinc-200 py-16">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeader
          eyebrow="VS Code"
          icon={Resources.assets.macos.icons.vscode}
          iconAlt="VS Code"
        >
          Filesystem semantics: drops resolve <em>into</em> the nearest folder.
          Selecting a file opens it — selection is the only wire to the editor
          pane.
        </SectionHeader>
        <TreeProvider controller={controller}>
          <SplitStage
            frame="bg-[#141416] ring-1 ring-white/5"
            tree={
              <div
                className={`flex ${STAGE_H} flex-col overflow-hidden rounded-lg border border-[#3C3C3C] bg-[#252526] font-mono shadow-lg`}
              >
                <div className="flex items-center gap-2 border-b border-[#3C3C3C] bg-[#333333] px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[#CCCCCC]">
                  <TerminalIcon className="size-3" />
                  <span>Explorer</span>
                </div>
                <DemoPanel
                  controller={controller}
                  enableDrag
                  indentBase={8}
                  indentStep={14}
                  className="min-h-0 flex-1 !border-0 !bg-[#252526]"
                  renderRow={(args) => <VSCodeRow args={args} />}
                  onIntent={(intent) => applyIntent(controller, intent)}
                />
              </div>
            }
            editor={<VSCodeEmptyEditor />}
          />
        </TreeProvider>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Finder — the window, open on a Mac desktop (wallpaper + dock)
// ───────────────────────────────────────────────────────────────────────────

const DOCK_APPS = [
  { name: "Finder", src: Resources.assets.macos.icons.finder },
  { name: "Safari", src: Resources.assets.macos.icons.safari },
  { name: "Messages", src: Resources.assets.macos.icons.messages },
  { name: "Maps", src: Resources.assets.macos.icons.maps },
  { name: "Notes", src: Resources.assets.macos.icons.notes },
  { name: "Reminders", src: Resources.assets.macos.icons.reminders },
  { name: "Freeform", src: Resources.assets.macos.icons.freeform },
  { name: "Music", src: Resources.assets.macos.icons.music },
  { name: "Logic Pro", src: Resources.assets.macos.icons.logicPro },
  { name: "Xcode", src: Resources.assets.macos.icons.xcode },
  { name: "VS Code", src: Resources.assets.macos.icons.vscode },
  { name: "Grida", src: Resources.assets.macos.icons.grida },
  { name: "Trash", src: Resources.assets.macos.icons.trashFull },
];

// ───────────────────────────────────────────────────────────────────────────
// Notion — workspace sidebar + a static document mock. The sidebar is the
// tree-view; the document is the consumer's "editor pane" (no live wiring,
// the doc is a mock — Notion's blocks aren't this package's job).
// ───────────────────────────────────────────────────────────────────────────

// One selector returning only the displayed strings, shallow-equal so the
// document body re-renders just when the title/emoji actually change —
// avoids the two-subscription pattern (one for selection, one to force
// re-render on source mutation) where the second emit was a no-op for the
// view.
type NotionDocView = { emoji: string; label: string };
const notionDocEq = (a: NotionDocView, b: NotionDocView) =>
  a.emoji === b.emoji && a.label === b.label;

function NotionDocument() {
  const view = useTreeSnapshot<DemoMeta, NotionDocView>((c) => {
    const id = c.getSelection()[0];
    if (!id) return { emoji: "📄", label: "Untitled" };
    try {
      const n = c.source.getNode(id);
      return {
        emoji: n.meta?.emoji ?? "📄",
        label: n.meta?.label ?? "Untitled",
      };
    } catch {
      return { emoji: "📄", label: "Untitled" };
    }
  }, notionDocEq);
  const { emoji, label } = view;
  return (
    <div
      className={`flex ${STAGE_H} flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm`}
    >
      {/* page chrome */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-1.5 text-[11px] text-zinc-500">
        <div className="flex items-center gap-1">
          <span>Workspace</span>
          <span>/</span>
          <span>{label}</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Share</span>
          <span>•••</span>
        </div>
      </div>
      {/* page body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6 text-[#37352F]">
        <div className="mb-2 text-5xl leading-none select-none">{emoji}</div>
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-[#37352F]">
          {label}
        </h1>
        <p className="text-[15px] leading-7 text-[#37352F]">
          Pages live in the sidebar — selecting one opens it here. Drop a page
          onto another to nest; drag between two pages to reorder. The sidebar
          and this document are wired to the same{" "}
          <code className="rounded bg-[#F1F1EF] px-1.5 py-0.5 text-[13px]">
            TreeController
          </code>
          .
        </p>
        <div className="my-4 flex items-start gap-3 rounded-md border border-[#E9E9E7] bg-[#F7F6F3] p-3 text-[14px] leading-6 text-[#37352F]">
          <span className="text-lg leading-none">💡</span>
          <span>
            The tree-view package never reads your page content. The doc you’re
            reading is a static mock — only the selection wires through.
          </span>
        </div>
        <h2 className="mt-6 mb-2 text-lg font-semibold text-[#37352F]">
          Today
        </h2>
        <ul className="space-y-1.5 text-[14px] leading-6 text-[#37352F]">
          <li>☐ Triage CodeRabbit comments on PR 719</li>
          <li>☐ Wire F12 reversed+desiredDepth test</li>
          <li>☑ Reverse-aware drag math (F10)</li>
          <li>
            ☑ Tolerant{" "}
            <code className="rounded bg-[#F1F1EF] px-1 py-0.5 text-[13px]">
              expandTo
            </code>{" "}
            (F11.1)
          </li>
        </ul>
      </div>
    </div>
  );
}

export function NotionShowcase() {
  // `selection` seeds the controller at construction so the document pane
  // is populated on first paint (no post-mount effect, no double-render).
  const controller = useThemeController(buildNotionFixture, {
    expanded: ["personal", "team", "engineering"],
    constraint: fsConstraint,
    selection: ["notes"],
  });
  return (
    <section className="border-t border-zinc-200 py-16">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeader
          eyebrow="Notion"
          icon={Resources.assets.macos.icons.notion}
          iconAlt="Notion"
        >
          Workspace sidebar with nested pages, emoji affordances, and
          drag-into-page. Selecting a page swaps the document on the right — one
          controller, one selection channel.
        </SectionHeader>
        <TreeProvider controller={controller}>
          <SplitStage
            frame="bg-[#F1F1EF] ring-1 ring-zinc-200/80"
            tree={
              <div
                className={`flex ${STAGE_H} flex-col overflow-hidden rounded-lg border border-zinc-200 bg-[#FBFBFA] shadow-sm`}
              >
                <div className="flex items-center gap-2 border-b border-zinc-200 bg-[#F7F6F3] px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  <span>softmarshmallow's Notion</span>
                </div>
                <DemoPanel
                  controller={controller}
                  enableDrag
                  indentBase={4}
                  indentStep={14}
                  className="min-h-0 flex-1 !border-0 !bg-[#FBFBFA]"
                  renderRow={(args) => <NotionRow args={args} />}
                  onIntent={(intent) => applyIntent(controller, intent)}
                />
              </div>
            }
            editor={<NotionDocument />}
          />
        </TreeProvider>
      </div>
    </section>
  );
}

export function FinderShowcase() {
  const controller = useThemeController(buildFinderFixture, {
    expanded: ["documents", "proj-grida", "downloads", "apps"],
    constraint: fsConstraint,
  });

  return (
    <section className="border-t border-zinc-200 py-16">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeader
          eyebrow="Finder"
          icon={Resources.assets.macos.icons.finder}
          iconAlt="Finder"
        >
          Multi-column rows, zebra striping, double-click to expand — the same
          core, dressed as macOS and dropped onto the desktop.
        </SectionHeader>
        {/* desktop — same outer card frame as the other showcases:
            rounded-2xl + p-2 outside, rounded-lg + overflow-hidden inside so
            the wallpaper clips concentric with the outer corner (16 - 8 = 8).
            Same `max-w-6xl px-4` container the other showcases use so this
            section's stage is the same width as Grida/Figma/VSCode/Notion. */}
        <div className="relative rounded-2xl bg-zinc-100 p-2 ring-1 ring-zinc-200/70">
          <MacOSDesktop className="relative flex min-h-[560px] flex-col overflow-hidden rounded-lg px-6 py-10 sm:aspect-[16/9] sm:min-h-0">
            <MacOSMenuBar
              appName="Finder"
              className="absolute inset-x-0 top-0 z-10"
              trailing={
                <>
                  <SearchIcon className="size-3" />
                  <span className="tabular-nums">Mon 9:41 AM</span>
                </>
              }
            />
            <div className="mt-6 flex flex-1 items-start justify-center">
              <MacOSWindow
                title="softmarshmallow"
                className="w-full max-w-[820px]"
              >
                <div className="grid h-7 grid-cols-[1fr] items-center border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wider text-zinc-500 md:grid-cols-[1fr_90px_160px_140px]">
                  <div className="px-3">Name</div>
                  <div className="hidden pr-3 text-right md:block">Size</div>
                  <div className="hidden px-1 md:block">Kind</div>
                  <div className="hidden items-center gap-1 md:flex">
                    Modified
                  </div>
                </div>
                <DemoPanel
                  controller={controller}
                  enableDrag
                  indentBase={16}
                  indentStep={16}
                  className="h-[360px] !border-0"
                  renderRow={(args) => <FinderRow args={args} />}
                  onIntent={(intent) => applyIntent(controller, intent)}
                />
              </MacOSWindow>
            </div>
            <MacOSDock
              apps={DOCK_APPS}
              className="pointer-events-auto absolute inset-x-0 bottom-4 z-10 mx-auto w-fit"
            />
          </MacOSDesktop>
        </div>
      </div>
    </section>
  );
}
