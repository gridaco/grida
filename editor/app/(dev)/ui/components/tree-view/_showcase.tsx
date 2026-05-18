"use client";

// ───────────────────────────────────────────────────────────────────────────
// Synced-editor showcase. Each section is one full-width demo, laid out as
//
//     [ tree view ]   ·space·   [ demo editor ]
//
// proving the same `TreeController` that drives the layers panel also drives
// a real editor surface — selecting, hovering, reordering, and deleting in
// the tree is reflected on the canvas (and back) using only the package's
// public channels + a one-line `applyIntent` bridge. No new package APIs:
// the canvas paints by walking the read-only `TreeSource`, so a reorder
// (which mutates `children`) re-stacks it for free.
// ───────────────────────────────────────────────────────────────────────────

import {
  InMemoryTreeSource,
  modeFromEvent,
  nextFocusAfterRemove,
  onlyIntoContainers,
  sameSelection,
  TreeController,
  type NodeId,
} from "@grida/tree-view";
import { TreeProvider, useTree, useTreeSnapshot } from "@grida/tree-view/react";
import {
  CommandIcon,
  FileCode2Icon,
  FolderIcon,
  ImageIcon,
  SearchIcon,
  SettingsIcon,
  TerminalIcon,
  Trash2Icon,
} from "lucide-react";
import * as React from "react";
import {
  buildFinderFixture,
  buildSceneFixture,
  buildVSCodeFixture,
  type DemoMeta,
} from "./_fixtures";
import { DemoPanel, useDemoController } from "./_panel";
import {
  applyIntent,
  FigmaRow,
  FinderRow,
  fsConstraint,
  GridaRow,
  HoverContext,
  useRowFlags,
  useThemeController,
  VSCodeRow,
} from "./_themes";

// ───────────────────────────────────────────────────────────────────────────
// Section scaffold — one consistent header + a tree | gap | editor grid so
// every demo lines up vertically regardless of its chrome.
// ───────────────────────────────────────────────────────────────────────────

function SectionHeader({
  eyebrow,
  accent,
  title,
  children,
}: {
  eyebrow: string;
  accent: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          <span className={`size-1.5 rounded-full ${accent}`} aria-hidden />
          {eyebrow}
        </div>
        <h3 className="text-2xl font-bold tracking-tight md:text-3xl">
          {title}
        </h3>
      </div>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  );
}

/**
 * tree | space | editor. The tree column is fixed-ish so the panels align
 * across sections; the editor takes the rest. Both children get the same
 * height so their tops and bottoms line up.
 */
function SplitStage({
  tree,
  editor,
}: {
  tree: React.ReactNode;
  editor: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
      <div className="w-full lg:w-[340px] lg:shrink-0">{tree}</div>
      <div className="min-w-0 flex-1">{editor}</div>
    </div>
  );
}

const STAGE_H = "h-[300px] sm:h-[440px]";

// ───────────────────────────────────────────────────────────────────────────
// Shared delete behaviour. The package has no "delete" — deletion is a
// source mutation the consumer owns. This is the entire recipe: pick the
// next focus from the *pre-mutation* rows, drop the subtrees, reconcile
// selection/focus. Same three lines a real editor writes.
// ───────────────────────────────────────────────────────────────────────────

function deleteSelection(controller: TreeController<DemoMeta>): void {
  const source = controller.source;
  if (!(source instanceof InMemoryTreeSource)) return;
  const root = source.getRoot();
  // Keep the artboard itself — deleting it would empty the canvas and make
  // the demo meaningless. Everything else (incl. groups) is fair game.
  const sel = controller
    .getSelection()
    .filter((id) => source.has(id) && source.getNode(id).parent !== root);
  if (sel.length === 0) return;
  const next = nextFocusAfterRemove(controller.getRows(), sel);
  for (const id of sel) source.remove(id);
  controller.select(next ? [next] : [], "replace");
  controller.focus(next);
}

// ───────────────────────────────────────────────────────────────────────────
// SVG canvas — the "demo editor" for Grida + Figma. Paints by walking the
// read-only source in document order (back → front); the tree renders the
// same source reversed (front layer on top, the layer-panel convention).
// ───────────────────────────────────────────────────────────────────────────

interface FlatShape {
  id: NodeId;
  meta: DemoMeta;
  kind: DemoMeta["kind"];
}

/** DFS the source from the artboard, document order = paint order. */
function flattenScene(
  controller: TreeController<DemoMeta>,
  artboardId: NodeId
): FlatShape[] {
  const source = controller.source;
  const out: FlatShape[] = [];
  const walk = (id: NodeId) => {
    let node;
    try {
      node = source.getNode(id);
    } catch {
      return;
    }
    if (node.meta?.box) out.push({ id, meta: node.meta, kind: node.meta.kind });
    for (const c of node.children) walk(c);
  };
  walk(artboardId);
  return out;
}

function radiusOf(meta: { box?: DemoMeta["box"]; radius?: number }): number {
  if (!meta.box) return 0;
  const max = Math.min(meta.box.w, meta.box.h) / 2;
  const r = meta.radius ?? 0;
  return r > max ? max : r;
}

function Shape({ s }: { s: FlatShape }) {
  const { meta } = s;
  const b = meta.box!;
  if (meta.kind === "group") return null; // organizational — no fill
  if (meta.kind === "text") {
    return (
      <text
        x={b.x}
        y={b.y + b.h / 2}
        fill={meta.fill ?? "#000"}
        fontSize={meta.fontSize ?? 14}
        fontWeight={meta.weight ?? 400}
        dominantBaseline="middle"
        style={{
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Inter, sans-serif",
        }}
      >
        {meta.text ?? meta.label}
      </text>
    );
  }
  const rx = radiusOf(meta);
  return (
    <g opacity={meta.opacity ?? 1}>
      <rect
        x={b.x}
        y={b.y}
        width={b.w}
        height={b.h}
        rx={rx}
        ry={rx}
        fill={meta.fill ?? "#E5E7EB"}
      />
      {meta.kind === "image" && (
        <g
          stroke="rgba(255,255,255,0.4)"
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle
            cx={b.x + b.w * 0.32}
            cy={b.y + b.h * 0.34}
            r={14}
            fill="rgba(255,255,255,0.35)"
            stroke="none"
          />
          <path
            d={`M ${b.x + b.w * 0.12} ${b.y + b.h * 0.82} L ${
              b.x + b.w * 0.42
            } ${b.y + b.h * 0.52} L ${b.x + b.w * 0.62} ${
              b.y + b.h * 0.7
            } L ${b.x + b.w * 0.8} ${b.y + b.h * 0.46} L ${
              b.x + b.w * 0.95
            } ${b.y + b.h * 0.82}`}
          />
        </g>
      )}
    </g>
  );
}

function SvgStage({
  controller,
  artboardId,
  tone,
  accent,
}: {
  controller: TreeController<DemoMeta>;
  artboardId: NodeId;
  tone: "light" | "dark";
  accent: string;
}) {
  const version = useTreeSnapshot<DemoMeta, number>((c) =>
    c.source.getVersion()
  );
  const selection = useTreeSnapshot<DemoMeta, readonly NodeId[]>(
    (c) => c.getSelection(),
    sameSelection
  );
  const { hovered, setHovered } = React.useContext(HoverContext);

  // version is the dependency: a move/remove bumps it and re-walks.
  const shapes = React.useMemo(
    () => flattenScene(controller, artboardId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [controller, artboardId, version]
  );
  const frame = shapes.find((s) => s.id === artboardId)?.meta.box ?? {
    x: 0,
    y: 0,
    w: 360,
    h: 460,
  };
  const selSet = React.useMemo(() => new Set(selection), [selection]);

  const onPick = (id: NodeId, e: React.PointerEvent) => {
    controller.focus(id);
    controller.select([id], modeFromEvent(e));
  };

  const dark = tone === "dark";
  const PAD = 26;
  const vb = `${frame.x - PAD} ${frame.y - PAD - 14} ${frame.w + PAD * 2} ${
    frame.h + PAD * 2 + 14
  }`;

  return (
    <div
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          deleteSelection(controller);
        }
      }}
      className={[
        "relative flex flex-col overflow-hidden rounded-xl border outline-none",
        STAGE_H,
        dark ? "border-neutral-800 bg-[#1B1B1F]" : "border-zinc-200 bg-zinc-50",
        "focus-visible:ring-2 focus-visible:ring-blue-400/60",
      ].join(" ")}
      style={{
        backgroundImage: `radial-gradient(${
          dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)"
        } 1px, transparent 1px)`,
        backgroundSize: "16px 16px",
      }}
    >
      <StageToolbar controller={controller} dark={dark} />

      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <svg
          viewBox={vb}
          className="max-h-full"
          style={{
            height: "100%",
            width: "auto",
            aspectRatio: `${frame.w} / ${frame.h}`,
          }}
          role="img"
          aria-label="Design canvas synced to the tree"
        >
          <defs>
            <clipPath id={`clip-${artboardId}`}>
              <rect
                x={frame.x}
                y={frame.y}
                width={frame.w}
                height={frame.h}
                rx={radiusOf(
                  shapes.find((s) => s.id === artboardId)?.meta ?? {
                    box: frame,
                  }
                )}
              />
            </clipPath>
            <filter
              id={`shadow-${artboardId}`}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feDropShadow
                dx="0"
                dy="18"
                stdDeviation="22"
                floodColor="#000"
                floodOpacity={dark ? 0.5 : 0.18}
              />
            </filter>
          </defs>

          {/* artboard name tab */}
          <text
            x={frame.x + 2}
            y={frame.y - 12}
            fontSize={12}
            fontWeight={600}
            fill={dark ? "#71717A" : "#A1A1AA"}
            style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
          >
            {(() => {
              try {
                return controller.source.getNode(artboardId).meta?.label;
              } catch {
                return "Cover";
              }
            })()}
          </text>

          <g filter={`url(#shadow-${artboardId})`}>
            {/* the artboard fill (frame) sits below the clip */}
            {shapes
              .filter((s) => s.id === artboardId)
              .map((s) => (
                <Shape key={s.id} s={s} />
              ))}
          </g>
          <g clipPath={`url(#clip-${artboardId})`}>
            {shapes
              .filter((s) => s.id !== artboardId)
              .map((s) => (
                <Shape key={s.id} s={s} />
              ))}
          </g>

          {/* selection + hover overlays paint above the artwork */}
          {shapes.map((s) => {
            const b = s.meta.box!;
            const isSel = selSet.has(s.id);
            const isHov = hovered === s.id;
            if (!isSel && !isHov) return null;
            return (
              <rect
                key={`o-${s.id}`}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={radiusOf(s.meta)}
                fill="none"
                stroke={accent}
                strokeWidth={isSel ? 2 : 1.5}
                strokeDasharray={
                  s.kind === "group" && !isSel ? "4 4" : undefined
                }
                opacity={isSel ? 1 : 0.7}
                pointerEvents="none"
              />
            );
          })}
          {shapes.map(
            (s) =>
              selSet.has(s.id) &&
              selection.length === 1 && (
                <g key={`h-${s.id}`} pointerEvents="none">
                  {(
                    [
                      [s.meta.box!.x, s.meta.box!.y],
                      [s.meta.box!.x + s.meta.box!.w, s.meta.box!.y],
                      [s.meta.box!.x, s.meta.box!.y + s.meta.box!.h],
                      [
                        s.meta.box!.x + s.meta.box!.w,
                        s.meta.box!.y + s.meta.box!.h,
                      ],
                    ] as const
                  ).map(([hx, hy], i) => (
                    <rect
                      key={i}
                      x={hx - 3.5}
                      y={hy - 3.5}
                      width={7}
                      height={7}
                      fill="#fff"
                      stroke={accent}
                      strokeWidth={1.5}
                    />
                  ))}
                </g>
              )
          )}

          {/* transparent hit targets, document order so the front-most wins */}
          {shapes.map((s) =>
            s.kind === "group" ? null : (
              <rect
                key={`hit-${s.id}`}
                data-tree-node-id={s.id}
                x={s.meta.box!.x}
                y={s.meta.box!.y}
                width={s.meta.box!.w}
                height={s.meta.box!.h}
                rx={radiusOf(s.meta)}
                fill="transparent"
                className="cursor-pointer"
                onPointerEnter={() => setHovered(s.id)}
                onPointerLeave={() => setHovered(null)}
                onPointerDown={(e) => onPick(s.id, e)}
              />
            )
          )}
        </svg>
      </div>

      <p
        className={[
          "shrink-0 border-t px-3 py-2 text-center text-[11px]",
          dark
            ? "border-neutral-800 text-neutral-500"
            : "border-zinc-200/70 text-zinc-400",
        ].join(" ")}
      >
        Drag rows to reorder · click a shape to select · ⌫ to delete
      </p>
    </div>
  );
}

function StageToolbar({
  controller,
  dark,
}: {
  controller: TreeController<DemoMeta>;
  dark: boolean;
}) {
  const selection = useTreeSnapshot<DemoMeta, readonly NodeId[]>(
    (c) => c.getSelection(),
    sameSelection
  );
  const source = controller.source as InMemoryTreeSource<DemoMeta>;
  const root = source.getRoot();
  const deletable = selection.filter((id) => {
    try {
      return source.getNode(id).parent !== root;
    } catch {
      return false;
    }
  });
  return (
    <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
      <span
        className={[
          "rounded-md px-2 py-1 text-[11px] font-medium tabular-nums",
          dark
            ? "bg-white/10 text-neutral-300"
            : "bg-white text-zinc-500 shadow-sm ring-1 ring-zinc-200",
        ].join(" ")}
      >
        {selection.length ? `${selection.length} selected` : "Nothing selected"}
      </span>
      <button
        type="button"
        disabled={deletable.length === 0}
        onClick={() => deleteSelection(controller)}
        title="Delete selection (⌫)"
        aria-label="Delete selection"
        className={[
          "inline-flex size-7 items-center justify-center rounded-md transition-colors disabled:opacity-30",
          dark
            ? "bg-white/10 text-neutral-300 enabled:hover:bg-red-500/20 enabled:hover:text-red-300"
            : "bg-white text-zinc-500 shadow-sm ring-1 ring-zinc-200 enabled:hover:bg-red-50 enabled:hover:text-red-600",
        ].join(" ")}
      >
        <Trash2Icon className="size-3.5" />
      </button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Grida — light layers panel + light canvas
// ───────────────────────────────────────────────────────────────────────────

export function GridaShowcase() {
  const controller = useDemoController(
    () =>
      new TreeController<DemoMeta>({
        source: buildSceneFixture(),
        flatten: { reverseChildren: true },
        expanded: ["cover", "actions"],
        constraint: onlyIntoContainers(),
      })
  );
  const flags = useRowFlags(() => ({ visible: true, locked: false }));
  const [hovered, setHovered] = React.useState<NodeId | null>(null);

  return (
    <section className="border-t border-zinc-200 py-16">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeader
          eyebrow="Grida"
          accent="bg-zinc-900"
          title="Layers, wired to a canvas."
        >
          One{" "}
          <code className="rounded bg-zinc-100 px-1 text-[12px]">
            TreeController
          </code>{" "}
          drives the panel <em>and</em> the artboard. Select, hover, reorder,
          delete on either side — the other follows.
        </SectionHeader>
        <TreeProvider controller={controller}>
          <HoverContext.Provider value={{ hovered, setHovered }}>
            <SplitStage
              tree={
                <div
                  className={`flex ${STAGE_H} flex-col rounded-xl border border-zinc-200 bg-white p-1 shadow-sm`}
                >
                  <DemoPanel
                    controller={controller}
                    enableDrag
                    indentBase={6}
                    indentStep={14}
                    className="min-h-0 flex-1 !border-0"
                    renderRow={(args) => <GridaRow args={args} flags={flags} />}
                    onIntent={(intent) => applyIntent(controller, intent)}
                  />
                </div>
              }
              editor={
                <SvgStage
                  controller={controller}
                  artboardId="cover"
                  tone="light"
                  accent="#18181B"
                />
              }
            />
          </HoverContext.Provider>
        </TreeProvider>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Figma — dark layers panel + dark canvas
// ───────────────────────────────────────────────────────────────────────────

export function FigmaShowcase() {
  const controller = useDemoController(
    () =>
      new TreeController<DemoMeta>({
        source: buildSceneFixture(),
        flatten: { reverseChildren: true },
        expanded: ["cover", "actions"],
        constraint: onlyIntoContainers(),
      })
  );
  const flags = useRowFlags(() => ({ visible: true, locked: false }));
  const [hovered, setHovered] = React.useState<NodeId | null>(null);

  return (
    <section className="border-t border-zinc-200 py-16">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeader
          eyebrow="Figma"
          accent="bg-[#0D99FF]"
          title="Same wiring, dark chrome."
        >
          Identical controller and intent bridge — only the row renderer and the
          canvas palette changed. Reordering a layer re-stacks the design.
        </SectionHeader>
        <TreeProvider controller={controller}>
          <HoverContext.Provider value={{ hovered, setHovered }}>
            <SplitStage
              tree={
                <div
                  className={`flex ${STAGE_H} flex-col overflow-hidden rounded-xl border border-neutral-700 bg-[#2C2C2C] shadow-lg`}
                >
                  <div className="flex items-center justify-between border-b border-neutral-700/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-400">
                    <span>Layers</span>
                    <span className="text-neutral-500">Cover</span>
                  </div>
                  <DemoPanel
                    controller={controller}
                    enableDrag
                    indentBase={8}
                    indentStep={16}
                    className="min-h-0 flex-1 !border-0 !bg-[#2C2C2C]"
                    renderRow={(args) => <FigmaRow args={args} flags={flags} />}
                    onIntent={(intent) => applyIntent(controller, intent)}
                  />
                </div>
              }
              editor={
                <SvgStage
                  controller={controller}
                  artboardId="cover"
                  tone="dark"
                  accent="#0D99FF"
                />
              }
            />
          </HoverContext.Provider>
        </TreeProvider>
      </div>
    </section>
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
      className={`flex ${STAGE_H} flex-col overflow-hidden rounded-xl border border-[#3C3C3C] bg-[#1E1E1E] font-mono shadow-lg`}
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
          accent="bg-sky-500"
          title="Explorer, opening files."
        >
          Filesystem semantics: drops resolve <em>into</em> the nearest folder.
          Selecting a file opens it — selection is the only wire to the editor
          pane.
        </SectionHeader>
        <TreeProvider controller={controller}>
          <SplitStage
            tree={
              <div
                className={`flex ${STAGE_H} flex-col overflow-hidden rounded-xl border border-[#3C3C3C] bg-[#252526] font-mono shadow-lg`}
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

const DOCK_APPS: {
  name: string;
  className: string;
  Icon: typeof FolderIcon;
}[] = [
  {
    name: "Finder",
    className: "from-sky-300 to-sky-500",
    Icon: FolderIcon,
  },
  {
    name: "Photos",
    className: "from-rose-300 to-orange-400",
    Icon: ImageIcon,
  },
  {
    name: "Terminal",
    className: "from-zinc-700 to-black",
    Icon: TerminalIcon,
  },
  {
    name: "Code",
    className: "from-sky-400 to-blue-600",
    Icon: FileCode2Icon,
  },
  {
    name: "Search",
    className: "from-violet-300 to-violet-500",
    Icon: SearchIcon,
  },
  {
    name: "Settings",
    className: "from-zinc-300 to-zinc-500",
    Icon: SettingsIcon,
  },
  {
    name: "Trash",
    className: "from-zinc-200 to-zinc-400",
    Icon: Trash2Icon,
  },
];

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
          accent="bg-emerald-500"
          title="It just looks native."
        >
          Multi-column rows, zebra striping, double-click to expand — the same
          core, dressed as macOS and dropped onto the desktop.
        </SectionHeader>
      </div>

      {/* desktop */}
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-2xl border border-black/10 px-4">
        <div
          className="relative flex min-h-[560px] flex-col px-6 py-10"
          style={{
            backgroundImage:
              "linear-gradient(160deg,#1e3a8a 0%,#6d28d9 38%,#db2777 70%,#f59e0b 100%)",
          }}
        >
          {/* menubar */}
          <div className="absolute inset-x-0 top-0 flex h-6 items-center justify-between bg-black/20 px-4 text-[11px] font-medium text-white/90 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <span></span>
              <span className="font-semibold">Finder</span>
              <span className="hidden sm:inline">File</span>
              <span className="hidden sm:inline">Edit</span>
              <span className="hidden sm:inline">View</span>
              <span className="hidden sm:inline">Go</span>
            </div>
            <div className="flex items-center gap-3">
              <SearchIcon className="size-3" />
              <span className="tabular-nums">Mon 9:41 AM</span>
            </div>
          </div>

          {/* finder window */}
          <div className="mt-6 flex flex-1 items-start justify-center">
            <div className="w-full max-w-[820px] overflow-hidden rounded-xl border border-black/10 bg-white shadow-2xl">
              <div className="flex items-center gap-2 border-b border-zinc-200 bg-gradient-to-b from-zinc-100 to-zinc-50 px-3 py-2">
                <span className="size-3 rounded-full bg-[#FF5F57]" />
                <span className="size-3 rounded-full bg-[#FEBC2E]" />
                <span className="size-3 rounded-full bg-[#28C840]" />
                <span className="ml-3 text-[12px] font-medium text-zinc-700">
                  softmarshmallow
                </span>
              </div>
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
            </div>
          </div>

          {/* dock */}
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
            <div className="pointer-events-auto flex items-end gap-3 rounded-2xl border border-white/30 bg-white/20 px-3 py-2 shadow-xl backdrop-blur-md">
              {DOCK_APPS.map((app) => (
                <div
                  key={app.name}
                  title={app.name}
                  className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-b ${app.className} text-white shadow-md transition-transform duration-150 hover:-translate-y-1.5`}
                >
                  <app.Icon className="size-5" strokeWidth={2} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
