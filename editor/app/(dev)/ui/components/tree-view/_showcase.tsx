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
  MacOSDesktop,
  MacOSDock,
  MacOSMenuBar,
  MacOSWindow,
} from "@/components/frames/macos-desktop";
import { Resources } from "@/resources";
import Image from "next/image";
import {
  CommandIcon,
  FileCode2Icon,
  SearchIcon,
  SettingsIcon,
  TerminalIcon,
  Trash2Icon,
} from "lucide-react";
import * as React from "react";
import {
  buildFinderFixture,
  buildNotionFixture,
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
  NotionRow,
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
// Auto-reveal: when selection changes (typically because the user clicked a
// shape in the SVG canvas), expand ancestors of the new focus and scroll its
// row into view. `block: "nearest"` is a no-op when the row is already
// on-screen, so it stays calm during normal tree-side clicks.
// ───────────────────────────────────────────────────────────────────────────

function AutoRevealSelection() {
  const controller = useTree<DemoMeta>();
  const focused = useTreeSnapshot<DemoMeta, NodeId | null>((c) =>
    c.getFocused()
  );
  // Same-id short-circuit defends against Strict Mode's effect double-
  // invoke (deps don't change between the pair, so the second run would
  // otherwise re-call `reveal()` and schedule a second scroll).
  const lastRevealed = React.useRef<NodeId | null>(null);
  // Anchor used to scope the row lookup to this showcase's `<section>`.
  // Both Grida and Figma showcases share a fixture id namespace, so a
  // document-wide `querySelector` would scroll the first matching row
  // anywhere on the page.
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    if (focused === null || focused === lastRevealed.current) return;
    lastRevealed.current = focused;
    controller.reveal(focused);
    const scope = anchorRef.current?.closest("section") ?? document;
    // Wait one frame so the rows newly mounted by `reveal()` are in the DOM
    // before we ask the browser to scroll to them.
    const raf = requestAnimationFrame(() => {
      scope
        .querySelector<HTMLElement>(
          `[data-tree-row-id="${CSS.escape(focused)}"]`
        )
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [controller, focused]);
  return <span ref={anchorRef} hidden aria-hidden="true" />;
}

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

// Hoisted to avoid allocating a fresh style object per shape per render —
// `Shape` is called for every node every paint, and a memoized component
// can short-circuit on `Object.is` only if the style ref is stable.
const TEXT_HOVER_STYLE: React.CSSProperties = {
  fontFamily: "ui-sans-serif, system-ui, -apple-system, Inter, sans-serif",
  filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.18))",
};
const TEXT_IDLE_STYLE: React.CSSProperties = {
  fontFamily: "ui-sans-serif, system-ui, -apple-system, Inter, sans-serif",
};
const RECT_HOVER_STYLE: React.CSSProperties = {
  filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.22))",
};
const TEXT_ANCHOR_OFFSET = { start: 0, middle: 0.5, end: 1 } as const;

const Shape = React.memo(function Shape({
  s,
  hovered,
}: {
  s: FlatShape;
  hovered: boolean;
}) {
  const { meta } = s;
  const b = meta.box!;
  if (meta.kind === "group") return null;
  if (meta.kind === "text") {
    const ta = meta.textAnchor ?? "start";
    return (
      <text
        x={b.x + b.w * TEXT_ANCHOR_OFFSET[ta]}
        y={b.y + b.h / 2}
        fill={meta.fill ?? "#000"}
        fontSize={meta.fontSize ?? 14}
        fontWeight={meta.weight ?? 400}
        dominantBaseline="middle"
        textAnchor={ta}
        style={hovered ? TEXT_HOVER_STYLE : TEXT_IDLE_STYLE}
      >
        {meta.text ?? meta.label}
      </text>
    );
  }
  const rx = radiusOf(meta);
  return (
    <g
      opacity={meta.opacity ?? 1}
      style={hovered ? RECT_HOVER_STYLE : undefined}
    >
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
});

// ───────────────────────────────────────────────────────────────────────────
// Selection chrome — a thin accent outline plus eight handle squares pinned
// just outside the bounding box. We render at viewport-stable widths by
// authoring in canvas units (the artboard's SVG userspace) and letting the
// SVG scale handle the rest; the badge font is sized in the same units so
// it tracks zoom consistently across the two showcases.
// ───────────────────────────────────────────────────────────────────────────

const SelectionChrome = React.memo(function SelectionChrome({
  box,
  accent,
  showHandles,
}: {
  box: { x: number; y: number; w: number; h: number };
  accent: string;
  showHandles: boolean;
}) {
  const { x, y, w, h } = box;
  // Slight outset so the outline doesn't bisect the artwork edge.
  const O = 0.5;
  const handles: Array<[number, number]> = showHandles
    ? [
        [x, y],
        [x + w / 2, y],
        [x + w, y],
        [x + w, y + h / 2],
        [x + w, y + h],
        [x + w / 2, y + h],
        [x, y + h],
        [x, y + h / 2],
      ]
    : [];
  const HS = 6; // handle side, canvas units
  return (
    <g pointerEvents="none">
      <rect
        x={x - O}
        y={y - O}
        width={w + O * 2}
        height={h + O * 2}
        fill="none"
        stroke={accent}
        strokeWidth={1.25}
        shapeRendering="crispEdges"
      />
      {handles.map(([hx, hy], i) => (
        <rect
          key={i}
          x={hx - HS / 2}
          y={hy - HS / 2}
          width={HS}
          height={HS}
          fill="#fff"
          stroke={accent}
          strokeWidth={1.25}
          shapeRendering="crispEdges"
        />
      ))}
    </g>
  );
});

const DimensionBadge = React.memo(function DimensionBadge({
  box,
  accent,
}: {
  box: { x: number; y: number; w: number; h: number };
  accent: string;
}) {
  const { x, y, w, h } = box;
  const label = `${Math.round(w)} × ${Math.round(h)}`;
  // Estimate a sensible width from char count; SVG can't auto-fit.
  const padX = 6;
  const padY = 3;
  const fontSize = 11;
  const textW = label.length * (fontSize * 0.58);
  const badgeW = textW + padX * 2;
  const badgeH = fontSize + padY * 2;
  const cx = x + w / 2;
  const top = y + h + 8;
  return (
    <g pointerEvents="none">
      <rect
        x={cx - badgeW / 2}
        y={top}
        width={badgeW}
        height={badgeH}
        rx={badgeH / 2}
        ry={badgeH / 2}
        fill={accent}
      />
      <text
        x={cx}
        y={top + badgeH / 2 + 0.5}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight={600}
        fill="#fff"
        style={{
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Inter, sans-serif",
        }}
      >
        {label}
      </text>
    </g>
  );
});

const HoverOutline = React.memo(function HoverOutline({
  box,
  radius,
  accent,
  dashed,
}: {
  box: { x: number; y: number; w: number; h: number };
  radius: number;
  accent: string;
  dashed: boolean;
}) {
  return (
    <rect
      x={box.x}
      y={box.y}
      width={box.w}
      height={box.h}
      rx={radius}
      ry={radius}
      fill="none"
      stroke={accent}
      strokeWidth={1}
      strokeOpacity={0.4}
      strokeDasharray={dashed ? "3 3" : undefined}
      pointerEvents="none"
    />
  );
});

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
  // One pass to build the id→shape lookup so hover/selection/artboard
  // probes are O(1) instead of N each per render.
  const byId = React.useMemo(
    () => new Map(shapes.map((s) => [s.id, s])),
    [shapes]
  );
  const artboardMeta = byId.get(artboardId)?.meta;
  const frame = artboardMeta?.box ?? { x: 0, y: 0, w: 360, h: 460 };
  const selSet = React.useMemo(() => new Set(selection), [selection]);

  const onPick = (id: NodeId, e: React.PointerEvent) => {
    controller.focus(id);
    controller.select([id], modeFromEvent(e));
  };

  const dark = tone === "dark";
  // Top gutter holds the artboard label, bottom gutter holds the single-
  // selection dimension badge — both painted in canvas userspace.
  const PAD = 28;
  const TOP_GUTTER = 18;
  const BOTTOM_GUTTER = 22;
  const vb = `${frame.x - PAD} ${frame.y - PAD - TOP_GUTTER} ${
    frame.w + PAD * 2
  } ${frame.h + PAD * 2 + TOP_GUTTER + BOTTOM_GUTTER}`;
  const artboardLabel = artboardMeta?.label ?? "Cover";
  const frameRadius = radiusOf(artboardMeta ?? { box: frame });

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
        "relative flex flex-col overflow-hidden rounded-lg border outline-none",
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
                rx={frameRadius}
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

          {/* artboard name tab — Figma-style label above the frame */}
          <text
            x={frame.x}
            y={frame.y - 8}
            fontSize={11}
            fontWeight={600}
            fill={accent}
            opacity={0.85}
            style={{
              fontFamily:
                "ui-sans-serif, system-ui, -apple-system, Inter, sans-serif",
              letterSpacing: 0.2,
            }}
          >
            {artboardLabel}
          </text>

          {/* artboard frame: fill + faint shadow + subtle 1px stroke */}
          <g filter={`url(#shadow-${artboardId})`}>
            {shapes
              .filter((s) => s.id === artboardId)
              .map((s) => (
                <Shape key={s.id} s={s} hovered={false} />
              ))}
            <rect
              x={frame.x}
              y={frame.y}
              width={frame.w}
              height={frame.h}
              rx={frameRadius}
              ry={frameRadius}
              fill="none"
              stroke={dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)"}
              strokeWidth={1}
              pointerEvents="none"
            />
          </g>

          <g clipPath={`url(#clip-${artboardId})`}>
            {shapes
              .filter((s) => s.id !== artboardId)
              .map((s) => (
                <Shape
                  key={s.id}
                  s={s}
                  hovered={hovered === s.id && !selSet.has(s.id)}
                />
              ))}
          </g>

          {/* Overlays paint above the artwork, in this order:
              1. hover outline (groups dashed, leaves solid, both at 40%)
              2. group bounds when selected (dashed)
              3. selection chrome (outline + handles)
              4. dimension badge for a single selection */}

          {/* hover outline — never for already-selected nodes */}
          {hovered &&
            (() => {
              const s = byId.get(hovered);
              if (!s || selSet.has(s.id)) return null;
              return (
                <HoverOutline
                  key={`hov-${s.id}`}
                  box={s.meta.box!}
                  radius={radiusOf(s.meta)}
                  accent={accent}
                  dashed={s.kind === "group"}
                />
              );
            })()}

          {/* selection chrome */}
          {shapes
            .filter((s) => selSet.has(s.id))
            .map((s) => (
              <SelectionChrome
                key={`sel-${s.id}`}
                box={s.meta.box!}
                accent={accent}
                showHandles={selection.length === 1}
              />
            ))}

          {/* dimension badge — only when exactly one node is selected */}
          {selection.length === 1 &&
            (() => {
              const id = selection[0]!;
              const s = byId.get(id);
              if (!s) return null;
              return (
                <DimensionBadge
                  key={`dim-${id}`}
                  box={s.meta.box!}
                  accent={accent}
                />
              );
            })()}

          {/* transparent hit targets, document order so the front-most wins.
              Groups now participate so users can grab the group's bounds —
              their hit area is the union, which matches the canvas idiom. */}
          {shapes.map((s) => (
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
          ))}
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
        expanded: ["cover", "items", "action"],
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
          icon={Resources.assets.macos.icons.grida}
          iconAlt="Grida"
        >
          One{" "}
          <code className="rounded bg-zinc-100 px-1 text-[12px]">
            TreeController
          </code>{" "}
          drives the panel <em>and</em> the artboard. Select, hover, reorder,
          delete on either side — the other follows.
        </SectionHeader>
        <TreeProvider controller={controller}>
          <AutoRevealSelection />
          <HoverContext.Provider value={{ hovered, setHovered }}>
            <SplitStage
              frame="bg-zinc-100 ring-1 ring-zinc-200/70"
              tree={
                <div
                  className={`flex ${STAGE_H} flex-col rounded-lg border border-zinc-200 bg-white p-1 shadow-sm`}
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
        expanded: ["cover", "items", "action"],
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
          icon={Resources.assets.macos.icons.figma}
          iconAlt="Figma"
        >
          Identical controller and intent bridge — only the row renderer and the
          canvas palette changed. Reordering a layer re-stacks the design.
        </SectionHeader>
        <TreeProvider controller={controller}>
          <AutoRevealSelection />
          <HoverContext.Provider value={{ hovered, setHovered }}>
            <SplitStage
              frame="bg-[#141417] ring-1 ring-white/5"
              tree={
                <div
                  className={`flex ${STAGE_H} flex-col overflow-hidden rounded-lg border border-neutral-700 bg-[#2C2C2C] shadow-lg`}
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
