"use client";

// ───────────────────────────────────────────────────────────────────────────
// @grida/hud — technical spec demo sections.
//
// Each section pins one contract the surface implements. Layout per section:
//
//   <SectionHeader>          // eyebrow + title + prose (the rule)
//   <SplitStage>             // toolbar + canvas + inspector
//   <SpecTable>              // one row per rule, with wg-doc citation chips
//                              where the rule traces back to a working-group
//                              decision. Source-file paths are intentionally
//                              not cited — they churn too fast to be durable.
// ───────────────────────────────────────────────────────────────────────────

import * as React from "react";
import vn from "@grida/vn";
import { PathModel } from "@grida/svg-editor";
import type {
  HUDDraw,
  HUDPaint,
  Intent,
  ParametricHandleInput,
  SelectionGroup,
  SurfaceVisibilityPolicy,
} from "@grida/hud";
import {
  DEFAULT_RULER_DRAG_THRESHOLD,
  measurementToHUDDraw,
  type PaddingOverlayInput,
  type TransformBoxInput,
  type AffineTransform,
} from "@grida/hud";
import { ParametricStar } from "./_star";
import { SvgEditorCanvas, SvgEditorProvider } from "@grida/svg-editor/react";
import { cursors as hud_cursors } from "@grida/hud/cursors";
import cmath from "@grida/cmath";
import { measure } from "@grida/cmath/_measurement";
import { Switch } from "@/components/ui/switch";
import {
  HUDStage,
  type HUDExtraBuilder,
  type HUDPlaygroundState,
} from "./_host";
import { InspectorPanel } from "./_panel";
import { SpecTable, cite, type SpecRow } from "./_spec-card";
import {
  selectionIntentFixture,
  cornerRadiusComboFixture,
  cornerRadiusComboRightTransform,
  CORNER_RADIUS_COMBO_LEFT_RECT,
  CORNER_RADIUS_COMBO_RIGHT_RECT,
  emptyFixture,
  groupFixture,
  lineFixture,
  measurementDemoFixture,
  pixelGridFixture,
  rotatedRectFixture,
  singleRectFixture,
  snapDemoFixture,
  unionShape,
  VECTOR_FIXTURE_OPEN_D,
  VECTOR_FIXTURE_CLOSED_D,
  networkToVectorOverlay,
  cloneNetwork,
  paddingOverlayFixture,
  PADDING_OVERLAY_CONTAINER_RECT,
  transformBoxFixture,
  TRANSFORM_BOX_FIXTURE_RECT,
  type Fixture,
} from "./_fixtures";

// ───────────────────────────────────────────────────────────────────────────
// Section scaffold
// ───────────────────────────────────────────────────────────────────────────

function SectionHeader({
  eyebrow,
  title,
  children,
  anchorId,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  anchorId?: string;
}) {
  return (
    <div className="mb-6 max-w-3xl space-y-2" id={anchorId}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
        {eyebrow}
      </div>
      <h2 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h2>
      <div className="text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </div>
  );
}

function SplitStage({
  toolbar,
  stage,
  inspector,
  stageHeight = "h-[460px]",
}: {
  toolbar?: React.ReactNode;
  stage: React.ReactNode;
  inspector: React.ReactNode;
  stageHeight?: string;
}) {
  return (
    <div className="rounded-2xl bg-zinc-100 p-2 ring-1 ring-zinc-200/70">
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-2 px-2 pt-1 pb-2">
          {toolbar}
        </div>
      ) : null}
      <div className={`flex ${stageHeight} flex-col gap-2 sm:flex-row`}>
        <div className="min-w-0 flex-1">{stage}</div>
        <div className="w-full sm:h-full sm:w-64 sm:shrink-0">{inspector}</div>
      </div>
    </div>
  );
}

function ToggleChip({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 shadow-sm">
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
      {label}
    </label>
  );
}

function ModeChip({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm">
      <span className="text-zinc-500">{label}</span>
      <div className="flex gap-0.5">
        {options.map((o) => (
          <button
            type="button"
            key={o}
            onClick={() => onChange(o)}
            className={[
              "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
              o === value
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:bg-zinc-100",
            ].join(" ")}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function ZoomBadge({ zoom, threshold }: { zoom: number; threshold: number }) {
  const over = zoom >= threshold;
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] shadow-sm tabular-nums",
        over
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-zinc-200 bg-white text-zinc-500",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block size-1.5 rounded-full",
          over ? "bg-emerald-500" : "bg-zinc-300",
        ].join(" ")}
      />
      zoom {zoom.toFixed(2)}× {over ? "≥" : "<"} {threshold}×
    </span>
  );
}

function Section({
  children,
  anchor,
}: {
  children: React.ReactNode;
  anchor?: string;
}) {
  return (
    <section
      id={anchor}
      className="scroll-mt-24 border-t border-zinc-200 py-16"
    >
      <div className="mx-auto max-w-6xl px-4">{children}</div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// §0 Primitives — the atoms every HUD chrome composes from.
//
// One stage, one row per primitive kind, each row showing the canonical
// variants for that kind (`HUDLine` plain/dashed/thick/with-label,
// `HUDRect` stroke vs. fill, `HUDPolyline` open vs. closed, etc.). The
// final row demonstrates the `HUDPaint` vocabulary (`solid` + `stripes`) —
// paint is a property of the primitives above, shown last so the reader
// recognises each primitive shape before being asked to read paint
// variation on top of it.
//
// Stage drawn via the `extra` builder, so the demo composes entirely on
// top of HUD's own primitive vocabulary — no special-case demo helpers
// in HUD itself.
// ───────────────────────────────────────────────────────────────────────────

const PRIMITIVES_INK = "#00a6f4";
const PRIMITIVES_STRIPES: HUDPaint = { kind: "stripes", color: PRIMITIVES_INK };

// Static reference scene. Module-scope so the per-frame `extra` builder
// returns the same reference on every redraw (no allocation in the hover
// hot path). Doc-space coordinates; the stage runs at the host's default
// identity camera so doc-space ≈ screen-space.
//
// Vertical layout — rows top to bottom:
//   y ≈ 50    HUDLine        (4 variants: plain, dashed, thick, labeled)
//   y ≈ 100   HUDRect        (4 variants: stroke, fill+stroke, dashed, fill-only)
//   y ≈ 180   HUDPolyline    (3 variants: open zigzag, closed stroke, closed fill)
//   y ≈ 270   HUDPoint       (one row of crosshairs)
//   y ≈ 320   HUDScreenRect  (4 variants: rect, circle, rotated, tl-anchored)
//   y ≈ 400   HUDPaint       (solid fill, stripes fill, solid stroke, stripes stroke)
const PRIMITIVES_DRAW: HUDDraw = {
  lines: [
    // ── HUDLine row ─────────────────────────────────────────────────
    { x1: 30, y1: 50, x2: 130, y2: 50, color: PRIMITIVES_INK },
    {
      x1: 170,
      y1: 50,
      x2: 270,
      y2: 50,
      dashed: true,
      color: PRIMITIVES_INK,
    },
    {
      x1: 310,
      y1: 50,
      x2: 410,
      y2: 50,
      strokeWidth: 4,
      color: PRIMITIVES_INK,
    },
    {
      x1: 450,
      y1: 50,
      x2: 580,
      y2: 50,
      label: "120 px",
      color: PRIMITIVES_INK,
    },
    // ── HUDPaint row ── strokes ─────────────────────────────────────
    {
      x1: 340,
      y1: 400,
      x2: 440,
      y2: 400,
      strokeWidth: 6,
      color: PRIMITIVES_INK,
    },
    {
      x1: 480,
      y1: 400,
      x2: 580,
      y2: 400,
      strokeWidth: 6,
      strokePaint: PRIMITIVES_STRIPES,
    },
  ],
  rects: [
    // ── HUDRect row ─────────────────────────────────────────────────
    {
      x: 30,
      y: 100,
      width: 100,
      height: 50,
      color: PRIMITIVES_INK,
    },
    {
      x: 170,
      y: 100,
      width: 100,
      height: 50,
      fill: true,
      fillOpacity: 0.3,
      color: PRIMITIVES_INK,
    },
    {
      x: 310,
      y: 100,
      width: 100,
      height: 50,
      dashed: true,
      color: PRIMITIVES_INK,
    },
    {
      x: 450,
      y: 100,
      width: 100,
      height: 50,
      stroke: false,
      fill: true,
      fillOpacity: 0.6,
      color: PRIMITIVES_INK,
    },
    // ── HUDPaint row ── fills ──────────────────────────────────────
    {
      x: 30,
      y: 380,
      width: 110,
      height: 40,
      fill: true,
      fillOpacity: 0.3,
      color: PRIMITIVES_INK,
      strokeWidth: 1,
    },
    {
      x: 170,
      y: 380,
      width: 110,
      height: 40,
      fill: true,
      fillPaint: PRIMITIVES_STRIPES,
      color: PRIMITIVES_INK,
      strokeWidth: 1,
    },
  ],
  polylines: [
    // ── HUDPolyline row ─────────────────────────────────────────────
    // open zigzag — stroke only (default)
    {
      points: [
        [30, 230],
        [60, 185],
        [90, 230],
        [120, 185],
        [150, 230],
      ],
      color: PRIMITIVES_INK,
    },
    // closed hexagon — stroke only
    {
      points: [
        [220, 185],
        [275, 185],
        [302, 207],
        [275, 230],
        [220, 230],
        [193, 207],
      ],
      color: PRIMITIVES_INK,
    },
    // closed hexagon — fill + stroke
    {
      points: [
        [380, 185],
        [435, 185],
        [462, 207],
        [435, 230],
        [380, 230],
        [353, 207],
      ],
      fill: true,
      fillOpacity: 0.3,
      color: PRIMITIVES_INK,
    },
  ],
  points: [
    // ── HUDPoint row ── crosshairs ─────────────────────────────────
    { x: 50, y: 270, color: PRIMITIVES_INK },
    { x: 110, y: 270, color: PRIMITIVES_INK },
    { x: 170, y: 270, color: PRIMITIVES_INK },
    { x: 230, y: 270, color: PRIMITIVES_INK },
    { x: 290, y: 270, color: PRIMITIVES_INK },
  ],
  screenRects: [
    // ── HUDScreenRect row ── fixed-screen-size handles ─────────────
    // Standard rect knob (center anchor, default shape).
    {
      x: 50,
      y: 320,
      width: 14,
      height: 14,
      fill: true,
      fillColor: "#ffffff",
      strokeColor: PRIMITIVES_INK,
    },
    // Circle (Fitts' reach: hit AABB stays a square).
    {
      x: 130,
      y: 320,
      width: 14,
      height: 14,
      shape: "circle",
      fill: true,
      fillColor: "#ffffff",
      strokeColor: PRIMITIVES_INK,
    },
    // Rotated rect — 45°.
    {
      x: 210,
      y: 320,
      width: 14,
      height: 14,
      angle: Math.PI / 4,
      fill: true,
      fillColor: "#ffffff",
      strokeColor: PRIMITIVES_INK,
    },
    // Top-left anchor — rect drawn down-right from the doc-space point.
    {
      x: 290,
      y: 320,
      width: 14,
      height: 14,
      anchor: "tl",
      fill: true,
      fillColor: "#ffffff",
      strokeColor: PRIMITIVES_INK,
    },
  ],
};

const primitivesExtra: HUDExtraBuilder = () => PRIMITIVES_DRAW;

const PRIMITIVE_LEGEND: { name: string; what: string }[] = [
  { name: "HUDLine", what: "plain · dashed · thick · with label" },
  { name: "HUDRect", what: "stroke · fill+stroke · dashed · fill-only" },
  { name: "HUDPolyline", what: "open zigzag · closed stroke · closed fill" },
  { name: "HUDPoint", what: "row of fixed-size crosshairs" },
  { name: "HUDScreenRect", what: "rect · circle · rotated · tl-anchored" },
  {
    name: "HUDPaint",
    what: "solid fill · stripes fill · solid stroke · stripes stroke",
  },
];

export function PrimitivesSection() {
  const fixture = React.useMemo(() => emptyFixture(), []);

  return (
    <Section anchor="primitives">
      <SectionHeader eyebrow="Primitives" title="The atoms HUD ships">
        Every chrome surface in this package — selection outlines, knobs,
        rulers, snap guides, measurement overlays — composes from six draw
        primitives. The stage walks them top to bottom: lines, rects, polylines,
        points, screen-space rects, and finally the paint vocabulary every
        primitive accepts on its fill and stroke slots.
      </SectionHeader>
      <SplitStage
        stage={
          <HUDStage
            fixture={fixture}
            // Non-interactive — this is a reference, not a sandbox.
            interactionLocked
            extra={primitivesExtra}
          />
        }
        inspector={
          <div className="h-full overflow-auto rounded-lg border border-zinc-200 bg-white p-4 text-xs leading-relaxed text-zinc-600">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Stage legend
            </div>
            <ol className="space-y-2.5">
              {PRIMITIVE_LEGEND.map((row, i) => (
                <li key={row.name} className="flex gap-2">
                  <span className="mt-px inline-block w-4 shrink-0 text-right font-mono text-[10px] tabular-nums text-zinc-400">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] font-semibold text-zinc-900">
                      {row.name}
                    </div>
                    <div className="text-[11px] text-zinc-500">{row.what}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        }
      />
      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "HUDLine",
              rule: (
                <>
                  Document-space line segment. Knobs: <code>strokeWidth</code>,{" "}
                  <code>dashed</code>, <code>color</code>, optional{" "}
                  <code>label</code> (rendered as a screen-space pill) +{" "}
                  <code>labelAngle</code> for rotated selections.
                </>
              ),
            },
            {
              name: "HUDRect",
              rule: (
                <>
                  Document-space axis-aligned rectangle. Independent{" "}
                  <code>stroke</code> / <code>fill</code> toggles,{" "}
                  <code>fillOpacity</code>, <code>dashed</code>,{" "}
                  <code>strokeWidth</code>. Selection outlines, marquee, and
                  layout zones all reduce to this primitive.
                </>
              ),
            },
            {
              name: "HUDPolyline",
              rule: (
                <>
                  Document-space polyline. Open by default; auto-closes when{" "}
                  <code>fill: true</code>. Even-odd fill rule. Per-primitive{" "}
                  <code>strokeOpacity</code> separate from{" "}
                  <code>fillOpacity</code> — used by the path-edit
                  hovered-segment state.
                </>
              ),
            },
            {
              name: "HUDPoint",
              rule: (
                <>
                  Document-space anchor drawn as a fixed-size screen-px
                  crosshair. Per-point <code>color</code> batches by color
                  bucket. Used for vertex / control-point markers.
                </>
              ),
            },
            {
              name: "HUDScreenRect",
              rule: (
                <>
                  Document-space anchor + screen-space dimensions — the
                  primitive that keeps knobs at constant visible size regardless
                  of zoom. Variants: <code>anchor</code> (center / corner),{" "}
                  <code>angle</code> for rotated selections,{" "}
                  <code>shape: &quot;rect&quot; | &quot;circle&quot;</code>{" "}
                  while the hit AABB stays a square for Fitts' reach.
                </>
              ),
            },
            {
              name: "HUDRule",
              rule: (
                <>
                  Full-viewport axis-aligned line at a document-space{" "}
                  <code>offset</code> on <code>&quot;x&quot;</code> or{" "}
                  <code>&quot;y&quot;</code>. Omitted from the stage — at full
                  width it would dominate every other primitive. Used by snap
                  guides and the ruler.
                </>
              ),
            },
            {
              name: "HUDPaint",
              rule: (
                <>
                  Closed taxonomy <code>solid | stripes</code>. The same value
                  flows into either <code>fillPaint</code> or{" "}
                  <code>strokePaint</code> — Canvas 2D's <code>fillStyle</code>{" "}
                  and <code>strokeStyle</code> both accept a{" "}
                  <code>CanvasPattern</code>. Hosts cannot register kinds at
                  runtime; new kinds enter HUD by PR with ≥2 consumers shaped.
                </>
              ),
            },
            {
              name: "Stripes defaults",
              rule: "45° / 8px / 1.5px in device pixels — matches the main editor's vector-edit hover-region pattern. Tile rasterizes at device-pixel density and HUD applies a counter-CTM pattern transform, so stripes stay constant width at any zoom.",
            },
            {
              name: "Anti-goals",
              rule: (
                <>
                  Closed taxonomy, not an open registry. One paint per fill, one
                  per stroke (no compositor). No paint on labels. See README's{" "}
                  <em>Anti-goals</em>.
                </>
              ),
            },
          ]}
        />
      </div>
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Architecture — no canvas, just the contract diagram.
// ───────────────────────────────────────────────────────────────────────────

export function ArchitectureSection() {
  return (
    <Section anchor="architecture">
      <SectionHeader eyebrow="Architecture" title="Three layers, one direction">
        Hud is a state machine plus a canvas renderer plus a thin wired surface.
        Dependencies flow{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          primitives ← event ← surface
        </code>{" "}
        — the host sits above all three.
      </SectionHeader>
      <div className="rounded-lg border border-zinc-200 bg-white p-6 font-mono text-[12px] leading-relaxed text-zinc-700">
        <pre className="whitespace-pre">{`Host (svg-editor, grida-canvas-react, …)
  - owns: Document, scene, selection, camera, history
  - provides: pick, shapeOf, vectorOf, onIntent
  - pushes: pointer / wheel / key events
  - commits: intents (history.preview / commit)
              │
              ▼
surface/  — wired class
  - Surface: lifecycle, draw loop, providers
  - chrome: builds HUDDraw from SurfaceState + shapeOf
  - vector-chrome: vertex / tangent / segment overlays
              │
   ┌──────────┴─────────┐
   ▼                    ▼
event/              primitives/
- pure math         - HUDCanvas
- gesture state     - HUDDraw primitives
- hit-regions       - snap/measure/lasso builders
- click-tracker     no state, no host
- decision          - vitest-friendly
no canvas, no DOM`}</pre>
      </div>
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Selection scenarios — pointer-down classifier
// ───────────────────────────────────────────────────────────────────────────

export function SelectionScenariosSection() {
  const fixture = React.useMemo(() => selectionIntentFixture(), []);
  const [state, setState] = React.useState<HUDPlaygroundState | null>(null);
  const [showRotation, setShowRotation] = React.useState(true);
  return (
    <Section anchor="selection-scenarios">
      <SectionHeader
        eyebrow="Selection intent"
        title="Pointer-down → Scenario, deterministically"
      >
        Every pointer-down classifies into one of a finite set of named
        scenarios. The classifier composes overlay hit (Tier 1) with scene pick
        (Tier 2) and the modifier snapshot. Same input → same routing, across
        versions. The fixture is deliberately overlap-dense — stacked cards, a
        nested rect, and a rotated bar — because the classifier&apos;s work only
        shows up when pick is ambiguous and chrome covers non-selected geometry.
        Click around and watch the scenario name in the inspector.
      </SectionHeader>
      <SplitStage
        toolbar={
          <>
            <ToggleChip
              label="Rotation handles"
              checked={showRotation}
              onCheckedChange={setShowRotation}
            />
            <span className="ml-auto text-[11px] text-zinc-500">
              ⌘/ctrl + wheel = zoom · middle-drag = pan · shift = additive
            </span>
          </>
        }
        stage={
          <HUDStage
            fixture={fixture}
            showRotationHandles={showRotation}
            onState={setState}
          />
        }
        inspector={<InspectorPanel state={state} title="Surface" />}
      />
      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "ContentReplace",
              rule: "Click unselected node, no shift → immediate select-replace (commits on-down).",
              citations: [cite.wgSelectionIntent()],
            },
            {
              name: "ContentAdd",
              rule: "Shift-click unselected node → immediate add to selection.",
              citations: [cite.wgSelectionIntent()],
            },
            {
              name: "ContentNarrowOrDrag",
              rule: "Click selected node (no shift) → defer. Drag = translate, click = narrow to self.",
              citations: [cite.wgSelection()],
            },
            {
              name: "ContentToggleOrDrag",
              rule: "Shift-click selected node → defer. Drag = translate, click = toggle off.",
              citations: [cite.wgSelectionIntent()],
            },
            {
              name: "BodyDragOnly",
              rule: "Drag chrome with no node under cursor → pend without deferred select; drag promotes to translate.",
              citations: [cite.wgSelectionIntent()],
            },
            {
              name: "BodyNarrowOrDrag",
              rule: "Drag chrome with hover ∈ selection (no shift) → defer. Drag = translate, click = narrow-to-self.",
              citations: [cite.wgSelection()],
            },
            {
              name: "BodyToggleOrDrag",
              rule: "Shift-drag chrome with hover ∈ selection → defer toggle-off vs drag.",
            },
            {
              name: "BodySwapOrDrag",
              rule: "Click chrome with hover ∉ selection → defer swap-to-hovered vs drag. Drag preserves the group; click swaps the selection.",
              citations: [cite.wgSelection()],
            },
            {
              name: "BodyAddOrDrag",
              rule: "Shift-click chrome with hover ∉ selection → defer toggle-add vs drag. NOT an immediate add.",
            },
            {
              name: "HandleResize",
              rule: "Pointer-down on resize knob or edge → start resize immediately (commit on-down).",
            },
            {
              name: "HandleRotate",
              rule: "Pointer-down on rotation region → start rotate gesture immediately.",
            },
            {
              name: "HandleEndpoint",
              rule: "Pointer-down on a line endpoint knob → start endpoint drag.",
            },
            {
              name: "EmptyMarquee",
              rule: "Click empty space (no selection) → pend marquee. Drag opens marquee; click commits empty.",
              citations: [cite.wgSelectionIntent()],
            },
            {
              name: "EmptyDeselectThenMarquee",
              rule: "Click empty space with selection → emit deselect_all + pend marquee.",
              citations: [cite.wgSelectionIntent()],
            },
            {
              name: "EmptyAdditiveMarquee",
              rule: "Shift-click empty space → pend additive marquee (preserves selection).",
            },
            {
              name: "EnterEdit",
              rule: "Double-click on content → emit enter_content_edit.",
            },
            {
              name: "ExitEdit",
              rule: "Double-click away from edit target while in content-edit → emit exit_content_edit. Takes precedence over EnterEdit.",
            },
            {
              name: "EmptyClearSubSelectionThenMarquee",
              rule: "Click empty space while in content-edit → clear vector sub-selection only; node-level selection preserved.",
            },
          ]}
        />
      </div>
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Group selection — SelectionGroup[]
// ───────────────────────────────────────────────────────────────────────────

export function GroupSelectionSection() {
  const fixture = React.useMemo(() => groupFixture(), []);
  const [state, setState] = React.useState<HUDPlaygroundState | null>(null);
  const [grouped, setGrouped] = React.useState(true);

  const groups = React.useMemo<SelectionGroup[] | undefined>(() => {
    if (!grouped) return undefined;
    const ids = ["child-a", "child-b", "child-c"];
    const r = unionShape(fixture, ids);
    if (!r) return undefined;
    return [
      {
        ids,
        shape: { kind: "rect", rect: r },
      },
    ];
  }, [fixture, grouped]);

  return (
    <Section anchor="group-selection">
      <SectionHeader
        eyebrow="Group selection"
        title="One envelope, many members"
      >
        Hosts pass a pre-computed{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          SelectionGroup[]
        </code>{" "}
        for multi-select: one shape (the union rect) plus the member ids. The
        surface draws a single envelope and routes body-region gestures against
        the group's members. Mirrors the svg-editor wiring at{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          dom.ts:1631–1666
        </code>
        .
      </SectionHeader>
      <SplitStage
        toolbar={
          <>
            <ToggleChip
              label="As SelectionGroup (union envelope)"
              checked={grouped}
              onCheckedChange={setGrouped}
            />
            <span className="text-[11px] text-zinc-500">
              Off = flat NodeId[] — three separate chromes
            </span>
          </>
        }
        stage={
          <HUDStage
            fixture={fixture}
            selection={["child-a", "child-b", "child-c"]}
            selectionGroups={groups}
            onState={setState}
          />
        }
        inspector={<InspectorPanel state={state} title="Group" />}
      />
      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "Selection normalization",
              rule: "Host invariant: parent and any descendant are never simultaneously selected. The router assumes the input already satisfies this.",
              citations: [cite.wgSelectionIntent()],
            },
            {
              name: "ids_at_down captures group members",
              rule: "On pointer-down within a body overlay, the surface records ids_at_down = chrome group members. Drag-threshold discriminates click vs. drag.",
              citations: [cite.wgSelectionIntent()],
            },
            {
              name: "BodySwapOrDrag (multi)",
              rule: "Click child of selected group → narrow to that child on click. Drag → translate the group as a unit.",
              citations: [cite.wgSelection()],
            },
            {
              name: "Member outlines",
              rule: "Multi-select shows a thin stroke rect per member, in addition to the union envelope. Host-fed extra: compute_member_outlines_extra.",
            },
          ]}
        />
      </div>
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Selection control layout — 9-slice priority ladder
// ───────────────────────────────────────────────────────────────────────────

export function LayoutSection() {
  const [width, setWidth] = React.useState(100);
  const [height, setHeight] = React.useState(100);
  const [state, setState] = React.useState<HUDPlaygroundState | null>(null);
  const fixture = React.useMemo(
    () => singleRectFixture(width, height),
    [width, height]
  );
  return (
    <Section anchor="layout">
      <SectionHeader
        eyebrow="Selection chrome layout"
        title="9-slice — priority ladder, axis-independent negotiation"
      >
        Selection chrome is a 9-slice over the selection rect: body + 4 corners
        + 4 edge strips + 4 rotation regions (drawn behind the corners). When
        width or height drops below the comfort threshold, the body promotes
        axis-independently — short rectangles still translate from their long
        axis. Hover the rectangle and watch the cursor — it tells you which zone
        you're in.
      </SectionHeader>
      <SplitStage
        toolbar={
          <>
            <SliderChip
              label="width"
              value={width}
              min={6}
              max={400}
              onChange={setWidth}
            />
            <SliderChip
              label="height"
              value={height}
              min={6}
              max={400}
              onChange={setHeight}
            />
          </>
        }
        stage={<HUDStage fixture={fixture} onState={setState} />}
        inspector={<InspectorPanel state={state} title="Layout" />}
      />
      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "Comfortable (≥ threshold)",
              rule: "Default ladder: corner > body > edge > rotate. Knobs at preferred size; edges fill the surplus along each axis.",
            },
            {
              name: "Small (≤ threshold on both)",
              rule: "Body region promotes above corner/edge. Knobs and edges still hit-test but body wins. Outside-the-bbox hits the corner knobs (paired hit pad).",
            },
            {
              name: "Elongated (one axis tight)",
              rule: "Edges orthogonal to the squeezed axis promote. N/S not promoted on a wide-but-short rect; W/E not promoted on a tall-but-narrow rect.",
            },
            {
              name: "Tiny (≤ MIN_CHROME_VISIBLE)",
              rule: "Chrome hidden. Body still hit-able anywhere inside the bbox; outside the bbox → no chrome.",
            },
            {
              name: "9-slice conservation",
              rule: "corner×2 + edge = perimeter axis (when > 0). Zones mutually exclusive — no double-count between corner and edge.",
            },
            {
              name: "Rotation halo wraps the corner",
              rule: "Rotation rect fully contains the resize-corner rect — no gap, no overlap with edges. Lowest priority so it loses to body/edge/corner.",
            },
          ]}
        />
      </div>
    </Section>
  );
}

function SliderChip({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs">
      <span className="text-zinc-500">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-32"
      />
      <code className="font-mono text-[11px] tabular-nums">{value}px</code>
    </label>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Transformed selections — rotated, sheared, mirrored
// ───────────────────────────────────────────────────────────────────────────

export function TransformedSection() {
  const [angleDeg, setAngleDeg] = React.useState(30);
  const [state, setState] = React.useState<HUDPlaygroundState | null>(null);
  const fixture = React.useMemo(
    () => rotatedRectFixture((angleDeg * Math.PI) / 180),
    [angleDeg]
  );
  return (
    <Section anchor="transformed">
      <SectionHeader
        eyebrow="Transformed selections"
        title="Knobs follow the artwork, not its AABB"
      >
        When{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">shapeOf</code>{" "}
        returns{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          {"{ kind: 'transformed', local, matrix }"}
        </code>
        , the surface runs the 9-slice in the artwork's own frame, rotates every
        knob with the parent, and hit-tests via{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">screen_obb</code>
        . Clicks outside the rotated rect never trigger phantom resize zones.
      </SectionHeader>
      <SplitStage
        toolbar={
          <SliderChip
            label="rotate"
            value={angleDeg}
            min={0}
            max={180}
            onChange={setAngleDeg}
          />
        }
        stage={<HUDStage fixture={fixture} onState={setState} />}
        inspector={<InspectorPanel state={state} title="Transformed" />}
      />
      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "Identity equivalence",
              rule: "With identity matrix, transformed chrome emits the same overlays / hits / priorities as the rect path.",
            },
            {
              name: "screen_obb hit-test",
              rule: "Rotated zone rects carry an inverse_transform that maps the pointer into shadow space before AABB containment. No bbox-of-rotated-corners inflation.",
            },
            {
              name: "Knob render carries angle",
              rule: "HUDScreenRect.angle rotates the knob around its screen-space center. Cursor baseAngle follows the matrix so resize/rotate arrows stay aligned with the tilt.",
            },
            {
              name: "Dashed resize preview",
              rule: "During resize on a transformed selection, the preview is a closed polyline through the four local corners projected by the matrix — not the AABB.",
            },
            {
              name: "Skew + non-uniform scale (v1 caveat)",
              rule: "Renders and hits correctly, but handle sizing uses a uniform-scale fallback. Anisotropic per-axis sizing is a follow-up.",
            },
            {
              name: "Mirror (negative determinant)",
              rule: "No crash; full 13-zone set is emitted. The outline polyline winds in the mirrored corner order.",
            },
          ]}
        />
      </div>
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Line selection — endpoint chrome on a `kind: "line"` shape.
//
// When `shapeOf(id)` returns `{ kind: "line", p1, p2 }`, the surface skips
// the 9-slice ladder entirely and emits a line-specific chrome: an outline
// along the segment plus two endpoint knobs at p1/p2 carrying
// `endpoint_handle` actions. The body translate zone uses the segment's
// AABB inflated to `MIN_HIT_SIZE` on each axis so axis-aligned lines
// (1-px-tall AABB) are still grabbable in the body.
//
// The demo runs three specimens — diagonal, horizontal, vertical — to
// exercise both the diagonal case (real AABB) and the axis-aligned cases
// (inflated AABB).
// ───────────────────────────────────────────────────────────────────────────

export function LineSection() {
  const fixture = React.useMemo(() => lineFixture(), []);
  const [state, setState] = React.useState<HUDPlaygroundState | null>(null);
  return (
    <Section anchor="line">
      <SectionHeader
        eyebrow="Line selection"
        title="Endpoint knobs, not a 9-slice"
      >
        When{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">shapeOf</code>{" "}
        returns{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          {"{ kind: 'line', p1, p2 }"}
        </code>
        , the surface skips the 9-slice ladder and paints a line-specific chrome
        — an outline along the segment plus two endpoint knobs that emit{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          set_endpoint
        </code>{" "}
        intents. The body translate zone uses the segment&apos;s AABB inflated
        to{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          MIN_HIT_SIZE
        </code>{" "}
        on each axis so axis-aligned lines (a 1-px-tall AABB) stay grabbable.
        Click any line to select it, drag an endpoint to move it, or drag the
        body to translate.
      </SectionHeader>
      <SplitStage
        stage={<HUDStage fixture={fixture} onState={setState} />}
        inspector={<InspectorPanel state={state} title="Line" />}
      />
      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "SelectionShape.line",
              rule: (
                <>
                  <code>{"{ kind: 'line', p1, p2 }"}</code> — two doc-space
                  endpoints. No rect, no transform; the surface treats the
                  segment itself as the artwork.
                </>
              ),
            },
            {
              name: "Endpoint knobs (p1, p2)",
              rule: (
                <>
                  One paired overlay per endpoint, drawn as an{" "}
                  <code>HUDScreenRect</code> at the doc-space point. Action
                  kind: <code>endpoint_handle</code> → scenario{" "}
                  <code>HandleEndpoint</code> → intent <code>set_endpoint</code>{" "}
                  (preview / commit).
                </>
              ),
            },
            {
              name: "Body AABB inflation",
              rule: (
                <>
                  Body translate zone uses the segment&apos;s AABB inflated to{" "}
                  <code>MIN_HIT_SIZE</code> on each axis. Without inflation, a
                  horizontal or vertical line has a degenerate (zero-thickness)
                  AABB and the body would be ungrabbable. Diagonal lines reach
                  the threshold naturally and skip the inflation.
                </>
              ),
            },
            {
              name: "Outline render",
              rule: (
                <>
                  One <code>HUDLine</code> primitive along p1→p2 — the same
                  primitive every other chrome uses for its outlines. No 9-slice
                  corners or edges; the segment IS the outline.
                </>
              ),
            },
            {
              name: "No rotation halo",
              rule: "Endpoint drag IS the rotation affordance — moving an endpoint pivots the line around the other endpoint. No separate rotation knob.",
            },
            {
              name: "set_endpoint contract",
              rule: (
                <>
                  Absolute <code>pos</code>, not a delta. Hosts that bind the
                  line to a node update the corresponding endpoint coordinate on{" "}
                  <code>commit</code>; <code>preview</code> ghosts it without
                  committing to history.
                </>
              ),
            },
          ]}
        />
      </div>
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Vector chrome
// ───────────────────────────────────────────────────────────────────────────

// Stable per-loop segment indices for the merged demo. The closed circle
// in the fixture is a single 4-segment closed loop (segments 0..3); we
// hand it to the surface as a single region so region chrome composes
// on the same shape that demos vertex / tangent / segment chrome.
// Region geometry is host-derived (`vn.snapshot()` doesn't expose loops)
// and the loop's topology is stable across vertex translations.
const CLOSED_PATH_REGIONS: ReadonlyArray<{ segments: number[] }> = [
  { segments: [0, 1, 2, 3] },
];

export function VectorChromeSection() {
  const [state, setState] = React.useState<HUDPlaygroundState | null>(null);
  const [insertionMode, setInsertionMode] = React.useState<
    "midpoint" | "projected"
  >("midpoint");
  const [selectionMode, setSelectionMode] = React.useState<"marquee" | "lasso">(
    "marquee"
  );
  const [bendMode, setBendMode] = React.useState<"auto" | "always">("auto");
  // Region feature-flag toggle — proves the schema-level absence rule
  // (no `regions` field → no region chrome rendered).
  const [regionsEnabled, setRegionsEnabled] = React.useState(true);

  // Live path geometry — held as `vn.VectorNetwork` for two reasons:
  //   - It's vn's mutation primitives (`translateVertex`, `updateTangent`,
  //     `splitSegment`, `bendSegment`) that turn HUD intents into geometry
  //     changes, so holding the network avoids parse/serialize per tick.
  //   - `@grida/svg-editor`'s `PathModel` is used ONCE at mount to parse
  //     the canonical `d` string into a network; after that, svg-editor
  //     stays out of the hot path. (Producer position recorded in spec
  //     table below: `vn`-as-mutation + `PathModel`-as-serialization is
  //     the intended composition seam.)
  const [openNetwork, setOpenNetwork] = React.useState<vn.VectorNetwork>(() =>
    cloneNetwork(PathModel.fromSvgPathD(VECTOR_FIXTURE_OPEN_D).snapshot())
  );
  const [closedNetwork, setClosedNetwork] = React.useState<vn.VectorNetwork>(
    () =>
      cloneNetwork(PathModel.fromSvgPathD(VECTOR_FIXTURE_CLOSED_D).snapshot())
  );

  // Sub-selection state — vertices, segments, tangents. Marquee / lasso
  // and direct vertex/segment/tangent clicks update these; mutation
  // intents read them (translate_vector_selection unions the selected
  // sub-state with `additional_vertex_indices` before applying).
  const [selectedVertices, setSelectedVertices] = React.useState<number[]>([]);
  const [selectedSegments, setSelectedSegments] = React.useState<number[]>([]);
  const [selectedTangents, setSelectedTangents] = React.useState<
    Array<[number, 0 | 1]>
  >([]);
  const [selectedRegions, setSelectedRegions] = React.useState<number[]>([]);

  // Gesture-start snapshot. HUD emits intent deltas as "from gesture
  // start to now," not incremental — so we freeze the network at
  // preview-phase-1 and re-apply the full delta from that snapshot each
  // tick. Cleared on commit (or on a new gesture taking over).
  const gestureSnapshotRef = React.useRef<vn.VectorNetwork | null>(null);

  const vectorEdit = React.useMemo(
    () => ({
      id: "path-closed" as string,
      selection: {
        vertices: selectedVertices,
        segments: selectedSegments,
        tangents: selectedTangents,
        regions: selectedRegions,
      },
    }),
    [selectedVertices, selectedSegments, selectedTangents, selectedRegions]
  );

  // Derive the static fixture once from initial geometry, just to give
  // HUDStage the node identities + selection bbox shape. The interactive
  // overlay below replaces the vector overlay per render.
  const fixture = React.useMemo<Fixture>(
    () => ({
      nodes: [
        {
          id: "path-open",
          kind: "vector",
          stroke: "#94A3B8",
          vector: networkToVectorOverlay(openNetwork),
        },
        {
          id: "path-closed",
          kind: "vector",
          stroke: "#94A3B8",
          vector: networkToVectorOverlay(closedNetwork, {
            neighbours: closedNetwork.vertices.map((_, i) => i),
            regions: regionsEnabled
              ? CLOSED_PATH_REGIONS.map((r) => ({ segments: r.segments }))
              : undefined,
          }),
        },
      ],
      initialSelection: ["path-closed"],
    }),
    [openNetwork, closedNetwork, regionsEnabled]
  );

  // Doc-space vertices of the closed path (for marquee/lasso hit-test).
  const pathVertices = React.useMemo<[number, number][]>(
    () => closedNetwork.vertices.map((v) => [v[0], v[1]] as [number, number]),
    [closedNetwork]
  );

  // React to intents — selection + mutation. One effect, one ref-dedupe
  // pattern. Mutation branches route by `intent.node_id` to the right
  // network setter.
  const lastSeenIntentRef = React.useRef<Intent | null>(null);
  React.useEffect(() => {
    const intent = state?.lastIntent;
    if (!intent || intent === lastSeenIntentRef.current) return;
    lastSeenIntentRef.current = intent;

    // ── Selection intents (read) ───────────────────────────────────────
    if (intent.kind === "marquee_select" && intent.phase === "commit") {
      const r = intent.rect;
      const hits: number[] = [];
      pathVertices.forEach((v, i) => {
        if (
          v[0] >= r.x &&
          v[0] <= r.x + r.width &&
          v[1] >= r.y &&
          v[1] <= r.y + r.height
        )
          hits.push(i);
      });
      setSelectedVertices((curr) =>
        intent.additive ? Array.from(new Set([...curr, ...hits])) : hits
      );
      return;
    }
    if (intent.kind === "lasso_select" && intent.phase === "commit") {
      const hits: number[] = [];
      pathVertices.forEach((v, i) => {
        if (cmath.polygon.pointInPolygon(v, intent.polygon as cmath.Vector2[]))
          hits.push(i);
      });
      setSelectedVertices((curr) =>
        intent.additive ? Array.from(new Set([...curr, ...hits])) : hits
      );
      return;
    }
    if (intent.kind === "select_vertex") {
      setSelectedVertices((curr) => {
        if (intent.mode === "replace") return [intent.index];
        const s = new Set(curr);
        if (intent.mode === "add") s.add(intent.index);
        else if (s.has(intent.index)) s.delete(intent.index);
        else s.add(intent.index);
        return Array.from(s);
      });
      return;
    }
    if (intent.kind === "select_segment") {
      setSelectedSegments((curr) => {
        if (intent.mode === "replace") return [intent.segment];
        const s = new Set(curr);
        if (intent.mode === "add") s.add(intent.segment);
        else if (s.has(intent.segment)) s.delete(intent.segment);
        else s.add(intent.segment);
        return Array.from(s);
      });
      return;
    }
    if (intent.kind === "select_region") {
      // Mirrors the main editor's `selectLoop` policy: region selection
      // also implies the loop's segments, so the segment chrome
      // highlights alongside the region's stripe paint.
      setSelectedRegions((curr) => {
        if (intent.mode === "replace") return [intent.region];
        const s = new Set(curr);
        if (intent.mode === "add") s.add(intent.region);
        else if (s.has(intent.region)) s.delete(intent.region);
        else s.add(intent.region);
        return Array.from(s);
      });
      const segs = CLOSED_PATH_REGIONS[intent.region]?.segments ?? [];
      setSelectedSegments((curr) => {
        if (intent.mode === "replace") return [...segs];
        const s = new Set(curr);
        if (intent.mode === "add") for (const x of segs) s.add(x);
        else if (segs.every((x) => s.has(x))) for (const x of segs) s.delete(x);
        else for (const x of segs) s.add(x);
        return Array.from(s);
      });
      return;
    }
    if (intent.kind === "select_tangent") {
      // HUD's intent.tangent is readonly `[number, 0|1]`; we hold a
      // mutable copy in state because HUD's vectorEdit selection field
      // is typed mutable.
      const t0 = intent.tangent[0];
      const t1 = intent.tangent[1];
      const next: [number, 0 | 1] = [t0, t1];
      setSelectedTangents((curr) => {
        const same = (t: [number, 0 | 1]) => t[0] === t0 && t[1] === t1;
        if (intent.mode === "replace") return [next];
        if (intent.mode === "add" && !curr.some(same)) return [...curr, next];
        if (intent.mode === "toggle") {
          return curr.some(same)
            ? curr.filter((t) => !same(t))
            : [...curr, next];
        }
        return curr;
      });
      return;
    }
    if (intent.kind === "clear_vector_selection") {
      setSelectedVertices([]);
      setSelectedSegments([]);
      setSelectedTangents([]);
      setSelectedRegions([]);
      return;
    }

    // ── Mutation intents — route by node_id ──────────────────────────────
    const isMut =
      intent.kind === "translate_vertices" ||
      intent.kind === "translate_vector_selection" ||
      intent.kind === "set_tangent" ||
      intent.kind === "bend_segment" ||
      intent.kind === "split_segment";
    if (!isMut) return;

    const targetId = intent.node_id;
    if (targetId !== "path-closed" && targetId !== "path-open") return;
    const liveNetwork =
      targetId === "path-closed" ? closedNetwork : openNetwork;
    const setNetwork =
      targetId === "path-closed" ? setClosedNetwork : setOpenNetwork;

    // ── Snapshot / phase plumbing ───────────────────────────────────────
    // `split_segment` is atomic (no phase); everything else uses the
    // freeze-at-preview-1, apply-from-frozen, clear-on-commit pattern.
    if (intent.kind !== "split_segment") {
      if (intent.phase === "preview" && !gestureSnapshotRef.current) {
        gestureSnapshotRef.current = cloneNetwork(liveNetwork);
      }
    }
    const base =
      intent.kind === "split_segment"
        ? liveNetwork
        : (gestureSnapshotRef.current ?? liveNetwork);
    const next = cloneNetwork(base);
    const editor = new vn.VectorNetworkEditor(next);

    if (intent.kind === "translate_vertices") {
      for (const i of intent.indices) {
        editor.translateVertex(i, [intent.dx, intent.dy]);
      }
    } else if (intent.kind === "translate_vector_selection") {
      // Union: explicit additional indices + currently selected vertices
      // + endpoints of selected segments. This mirrors the contract on
      // the intent: HUD seeds `additional_vertex_indices`; the host
      // unions with its own authoritative sub-selection.
      const idxs = new Set<number>(intent.additional_vertex_indices);
      for (const v of selectedVertices) idxs.add(v);
      for (const segIdx of selectedSegments) {
        const seg = base.segments[segIdx];
        if (seg) {
          idxs.add(seg.a);
          idxs.add(seg.b);
        }
      }
      for (const i of idxs) {
        editor.translateVertex(i, [intent.dx, intent.dy]);
      }
    } else if (intent.kind === "set_tangent") {
      const [vIdx, side] = intent.tangent;
      // side === 0 means "ta of the segment whose a === vIdx";
      // side === 1 means "tb of the segment whose b === vIdx".
      const segIdx = base.segments.findIndex((s) =>
        side === 0 ? s.a === vIdx : s.b === vIdx
      );
      if (segIdx >= 0) {
        const v = base.vertices[vIdx];
        const relative: [number, number] = [
          intent.pos[0] - v[0],
          intent.pos[1] - v[1],
        ];
        editor.updateTangent(
          segIdx,
          side === 0 ? "ta" : "tb",
          relative,
          intent.mirror
        );
      }
    } else if (intent.kind === "bend_segment") {
      const frozen = base.segments[intent.segment];
      if (frozen) {
        editor.bendSegment(intent.segment, intent.ca, intent.cb, {
          a: [base.vertices[frozen.a][0], base.vertices[frozen.a][1]],
          b: [base.vertices[frozen.b][0], base.vertices[frozen.b][1]],
          ta: [frozen.ta[0], frozen.ta[1]],
          tb: [frozen.tb[0], frozen.tb[1]],
        });
      }
    } else if (intent.kind === "split_segment") {
      editor.splitSegment({ segment: intent.segment, t: intent.t });
    }

    setNetwork(editor.value);

    if (intent.kind !== "split_segment" && intent.phase === "commit") {
      gestureSnapshotRef.current = null;
    }
  }, [
    state?.lastIntent,
    pathVertices,
    closedNetwork,
    openNetwork,
    selectedVertices,
    selectedSegments,
  ]);
  const resetGeometry = React.useCallback(() => {
    setOpenNetwork(
      cloneNetwork(PathModel.fromSvgPathD(VECTOR_FIXTURE_OPEN_D).snapshot())
    );
    setClosedNetwork(
      cloneNetwork(PathModel.fromSvgPathD(VECTOR_FIXTURE_CLOSED_D).snapshot())
    );
    setSelectedVertices([]);
    setSelectedSegments([]);
    setSelectedTangents([]);
    setSelectedRegions([]);
    gestureSnapshotRef.current = null;
  }, []);

  return (
    <Section anchor="vector">
      <SectionHeader
        eyebrow="Vector chrome"
        title="Vertices, tangents, segments, regions — all in the package"
      >
        Pass{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          setVectorSelection({"{ node_id, vertices }"})
        </code>{" "}
        and the surface draws vertex circles, tangent diamonds, segment outlines
        (with idle/hover/selected state), region body chrome for closed loops,
        and a ghost insertion knob at the cursor. The path is fully editable —
        drag a vertex, drag a tangent diamond, alt-drag a segment to bend, click
        the ghost to insert, click inside a closed loop to select the region.
        The host applies every mutation intent through{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">@grida/vn</code>{" "}
        and re-emits geometry to HUD; the seam between the two SDKs is host
        territory by design. The{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">regions</code>{" "}
        field on the overlay is the schema-level feature flag — toggle it off
        and region chrome disappears entirely, without any HUD-side branching.
      </SectionHeader>
      <SplitStage
        toolbar={
          <>
            <ModeChip
              label="Insertion"
              value={insertionMode}
              options={["midpoint", "projected"]}
              onChange={(v) => setInsertionMode(v as "midpoint" | "projected")}
            />
            <ModeChip
              label="Selection"
              value={selectionMode}
              options={["marquee", "lasso"]}
              onChange={(v) => setSelectionMode(v as "marquee" | "lasso")}
            />
            <ModeChip
              label="Bend"
              value={bendMode}
              options={["auto", "always"]}
              onChange={(v) => setBendMode(v as "auto" | "always")}
            />
            <ToggleChip
              label="Regions"
              checked={regionsEnabled}
              onCheckedChange={setRegionsEnabled}
            />
            <button
              type="button"
              onClick={resetGeometry}
              className="ml-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50"
              title="Reset both paths to their initial geometry"
            >
              Reset
            </button>
          </>
        }
        stage={
          <HUDStage
            fixture={fixture}
            vectorEdit={vectorEdit}
            vectorInsertionMode={insertionMode}
            vectorSelectionMode={selectionMode}
            vectorBendMode={bendMode}
            onState={setState}
          >
            <div className="pointer-events-none absolute left-3 top-3 z-10 space-y-0.5 rounded-md border border-zinc-200 bg-white/95 px-2 py-1 font-mono text-[11px] text-zinc-700 shadow backdrop-blur">
              <div>
                vertices:{" "}
                <span className="text-zinc-900">
                  {selectedVertices.length === 0
                    ? "—"
                    : `[${selectedVertices.sort((a, b) => a - b).join(", ")}]`}
                </span>
              </div>
              <div>
                regions:{" "}
                <span className="text-zinc-900">
                  {selectedRegions.length === 0
                    ? "—"
                    : `[${selectedRegions.sort((a, b) => a - b).join(", ")}]`}
                </span>
              </div>
            </div>
          </HUDStage>
        }
        inspector={<InspectorPanel state={state} title="Vector" />}
      />
      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "Vertex knob",
              rule: "One paired overlay per vertex. Render as circle, hit as square padded to MIN_HIT_SIZE. Selected fills with chrome color.",
            },
            {
              name: "Tangent diamond",
              rule: "45°-rotated square, smaller than vertex. Skipped when control == vertex (degenerate). Selected uses highlight fill.",
            },
            {
              name: "Segment outline",
              rule: "State machine: idle → segmentIdleColor; hover → segmentActiveColor at hoverOpacity; selected → solid active. Hover wins over selected.",
            },
            {
              name: "Segment strip (virtual hit)",
              rule: "N+1 polyline points along the cubic (no render). Custom hit-test via point-to-curve projection — within 8 screen-px claims the click.",
            },
            {
              name: "Ghost insertion knob",
              rule: "Smaller than vertex; appears at midpoint (t=0.5) or projected cursor. Suppressed while is_interacting=true.",
            },
            {
              name: "Priority ladder",
              rule: "tangent (4) < vertex (5) < segment (8). Lower wins on overlap.",
            },
            {
              name: "Marquee / lasso → vertex sub-selection",
              rule: "Empty-space drag inside content-edit fires marquee_select or lasso_select (per vectorSelectionMode) with phase preview→commit. The host runs the predicate (rect contains vertex / point-in-polygon) and pushes the result back via setVectorSelection.",
            },
            {
              name: "Vertex drag",
              rule: "translate_vertices preview/commit — drag any vertex (selection or not) and the selected sub-set translates with it. The host freezes the network at preview-1 and applies the gesture-from-start delta against the frozen state each tick, so deltas never accumulate.",
            },
            {
              name: "Tangent drag",
              rule: "set_tangent preview/commit — the host maps HUD's (vertex, side) tangent reference to vn's (segmentIndex, ta|tb), subtracts the vertex position to convert HUD's absolute target to vn's relative tangent vector, then applies through vn's mirror policy (auto/none/angle/all).",
            },
            {
              name: "Segment drag (no Meta)",
              rule: "translate_vector_selection preview/commit — the whole sub-selection moves with the cursor. The host unions HUD's additional_vertex_indices with the selected vertices + endpoints of selected segments before applying translateVertex.",
            },
            {
              name: "Segment drag with Meta",
              rule: "bend_segment preview/commit — the pivot is the drag-start projection on the curve (not 0.5). The host passes the segment's frozen endpoints + tangents to vn.bendSegment so each preview tick re-solves the cubic from the same starting state.",
            },
            {
              name: "Ghost split-and-drag",
              rule: "Pointer-down on ghost → split_segment fires immediately (atomic, no phase), then translate_vertices preview/commit on the newly-inserted vertex. Press-no-drag commits insert with zero delta.",
            },
            {
              name: "Region — feature flag (schema-level)",
              rule: "Absence of `VectorOverlay.regions` = no region chrome rendered. No separate `enableRegions` boolean — the data is the flag. Backends that can't enumerate loops simply omit the field. Toggle the toolbar switch to prove it: region chrome disappears entirely without any HUD-side branching.",
            },
            {
              name: "Region — geometry",
              rule: "Each region carries `segments: number[]` — segment indices forming a closed loop. The HUD reconstructs the cubic path at chrome build time from `vertices` + the referenced segments. Regions carry no own geometry.",
            },
            {
              name: "Region — hit-test & priority",
              rule: "Screen-space AABB + `customHitTest` running `cmath.polygon.pointInPolygon` against the rasterised loop polygon. Priority REGION_PRIORITY (9) strictly above SEGMENT_STRIP_PRIORITY (8) — any vertex / tangent / ghost / segment-strip control within the loop wins. Wins over empty-space miss → clicking the interior selects the region instead of starting a marquee.",
            },
            {
              name: "Region — paint",
              rule: "Idle: no render (hit registered, body visually transparent). Hover: doc_polyline fill with `style.vectorRegionHoverPaint` (default HUDPaintStripes 45° / 8px / 1.5px, accent, 50%). Selected: `style.vectorRegionSelectedPaint` (default same stripes at 70%). Hover wins over selected.",
            },
            {
              name: "Region — select intent",
              rule: "select_region { node_id, region, mode } — eager at pointer-down. Shift → toggle, no-shift → replace. The host mirrors the loop's segments into the segment sub-selection (the main editor's `selectLoop` policy) so segment chrome highlights along with the region's stripe paint.",
            },
            {
              name: "Region — drag",
              rule: "Drag from a region body promotes to `translate_vector_selection` (no new translate intent kind). The HUD seeds `additional_vertex_indices` with the loop's endpoint vertices so the gesture works even before the host echoes the region select.",
            },
            {
              name: "Mutation seam (producer position)",
              rule: (
                <>
                  <code>@grida/vn</code> provides the vector-network mutation
                  primitives; <code>@grida/svg-editor</code>&apos;s{" "}
                  <code>PathModel</code> provides canonical{" "}
                  <code>d ↔ vector-network</code> conversion. Hosts that want to
                  mutate a path&apos;s geometry compose the two at the host
                  layer. The seam is intentional; widening{" "}
                  <code>PathModel</code>&apos;s public surface to carry
                  mutation, or shipping a host-shaped reducer that names a
                  specific intent vocabulary, is out of scope. This demo is the
                  proof.
                </>
              ),
            },
          ]}
        />
      </div>
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Padding overlay (Layer B)
// ───────────────────────────────────────────────────────────────────────────

export function PaddingOverlaySection() {
  const [state, setState] = React.useState<HUDPlaygroundState | null>(null);

  // Host-owned padding values. The HUD reads them via `setPaddingOverlay`
  // each render; intents flow back via `onPaddingHandle`. Active-side
  // mirror is HUD-owned (derived from gesture state) — no host shadow.
  const [padding, setPadding] = React.useState({
    top: 24,
    right: 16,
    bottom: 32,
    left: 16,
  });
  // Feature-flag toggle in the inspector — pop `paddingOverlay` to `null`
  // and chrome disappears entirely (schema-level absence is the off state).
  const [overlayEnabled, setOverlayEnabled] = React.useState(true);

  // Rebuild the fixture each render so the inner "content" rect tracks
  // the live padding values — the reader sees the content shrink/grow as
  // the handles drag, which is what makes the affordance intuitive.
  const fixture = React.useMemo(
    () => paddingOverlayFixture(padding),
    [padding]
  );

  const containerRect = PADDING_OVERLAY_CONTAINER_RECT;

  const paddingOverlay = React.useMemo<PaddingOverlayInput | null>(() => {
    if (!overlayEnabled) return null;
    return {
      node_id: "container",
      rect: containerRect,
      padding,
    };
  }, [overlayEnabled, containerRect, padding]);

  // Forward `padding_handle` intents to the local reducer.
  const handlePadding = React.useCallback((intent: Intent) => {
    if (intent.kind !== "padding_handle") return;
    setPadding((prev) => {
      const next = { ...prev };
      next[intent.side] = Math.round(intent.value);
      if (intent.mirror) {
        const opp =
          intent.side === "top"
            ? "bottom"
            : intent.side === "bottom"
              ? "top"
              : intent.side === "left"
                ? "right"
                : "left";
        next[opp] = Math.round(intent.value);
      }
      return next;
    });
  }, []);

  return (
    <Section anchor="padding-overlay">
      <SectionHeader
        eyebrow="Padding overlay"
        title="Flex-parent padding chrome — a Layer B model"
      >
        Four hover-sensitive inset side rects with diagonal-stripe affordance
        and a mid-edge drag handle each. Drag a handle and the inner blue{" "}
        <em>content</em> rect resizes live — the host re-derives its layout from
        the per-side padding values streamed back via{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          padding_handle
        </code>{" "}
        intents. Toggle the switch above the canvas to prove the schema-level
        feature flag — the chrome disappears entirely without any host-side
        branching. Alt-drag mirrors the value to the opposite side; HUD reads
        the modifier directly (no host-pushed shadow).
      </SectionHeader>
      <SplitStage
        toolbar={
          <div className="flex items-center gap-2 px-1 text-[12px]">
            <Switch
              id="padding-flag"
              checked={overlayEnabled}
              onCheckedChange={setOverlayEnabled}
            />
            <label
              htmlFor="padding-flag"
              className="cursor-pointer font-mono text-zinc-700"
            >
              setPaddingOverlay input pushed
            </label>
          </div>
        }
        stage={
          <HUDStage
            fixture={fixture}
            paddingOverlay={paddingOverlay}
            onPaddingHandle={handlePadding}
            onState={setState}
          >
            <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-zinc-200 bg-white/95 px-2 py-1 font-mono text-[11px] text-zinc-700 shadow backdrop-blur">
              padding: t={padding.top} r={padding.right} b={padding.bottom} l=
              {padding.left}
            </div>
          </HUDStage>
        }
        inspector={<InspectorPanel state={state} title="Padding overlay" />}
      />
      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "Feature flag (schema-level)",
              rule: "Absence of `surface.setPaddingOverlay(...)` input = no chrome rendered. No separate `enablePadding` boolean — the data is the flag. Hosts that don't track padding don't push input.",
            },
            {
              name: "Geometry",
              rule: "Per-side inset rect in doc-space. `top` = full width × top padding; `right` = right padding × full height; bottom/left symmetric. Absent / zero sides skipped — no overlay element, no hit region.",
            },
            {
              name: "Hit-test",
              rule: "Region: doc-space rect projected to a screen-space AABB on every frame, so the hit body scales with zoom. Handle: 16px screen-px square at the mid-edge, padded to MIN_HIT_SIZE.",
            },
            {
              name: "Hit-priority",
              rule: "PADDING_HANDLE_PRIORITY (12) wins over corner-radius (15), resize (≥30), translate body (40). PADDING_REGION_PRIORITY (35) wins over body, loses to resize — clicking inside the padding fires hover; clicking a corner still resizes.",
            },
            {
              name: "Paint — idle",
              rule: "No fill (render omitted). Hit still registered — the body becomes interactive on hover.",
            },
            {
              name: "Paint — hover",
              rule: "doc_polyline fill with `style.paddingHoverPaint` — default HUDPaintStripes 45° / 8px / 1.5px, accent color, 50% opacity. Alt-held: BOTH the hovered side AND its opposite paint. HUD reads `alt` directly.",
            },
            {
              name: "Paint — selected (during drag)",
              rule: "Stroked OUTLINE of the side rect (no stripe fill). `color = style.paddingSelectedStroke`, `strokeWidth = selectionOutlineWidth`. HUD-owned — derived from `state.gesture` when a `padding_handle` drag is in flight. The outline communicates the live padding value cleanly; stripes would read as hover preview. Mirrors to opposite side when `alt` is held.",
            },
            {
              name: "Paint — hover on handle",
              rule: "The hover stripe also lights up when the cursor is on the side's drag handle (not just the region body) — the handle is part of the side's affordance, so losing the stripe when the cursor crosses onto the knob would be jarring.",
            },
            {
              name: "Value math (2× handle displacement)",
              rule: "Handle sits at the CENTER of the padding strip (`y = padding.top / 2` for top). For the handle to track the cursor 1:1, padding changes at 2× the cursor displacement from the rect edge: `value = 2 × (cursor_y - rect.y)` for top, symmetric for others. Click-no-drag preserves the initial value.",
            },
            {
              name: "Intent — drag",
              rule: "`padding_handle { node_id, side, value, mirror, phase }`. Preview-stream on every move + one commit on release. `mirror` is read LIVE per frame — toggling alt mid-drag flips the flag on subsequent previews. Layer B dedicated kind; internally reducible to parametric-handle drag math.",
            },
          ]}
        />
      </div>
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Transform-box (Layer B) — TWO sections that share the same chrome but
// commit to DIFFERENT host-side targets. The duality IS the demo seam's
// dogfooding pass: per sdk-design, a public contract is shaped by ≥2
// internal consumers. Until the main-editor image-paint editor lands,
// the demo plays the role of consumer #2.
// ───────────────────────────────────────────────────────────────────────────

const IDENTITY_AFFINE: AffineTransform = [
  [1, 0, 0],
  [0, 1, 0],
];

/** Demo image — public asset, abstract placeholder. */
const TRANSFORM_BOX_DEMO_IMAGE = "/images/abstract-placeholder.jpg";

/** Decompose an affine transform into rotation°/scale/translation for
 *  inspector display. Mirrors the math primitive's `decompose` without
 *  pulling cmath transitively into the demo. */
function decomposeAffineForDisplay(m: AffineTransform): {
  rotation: number;
  scale: [number, number];
  translation: [number, number];
} {
  const a = m[0][0];
  const b = m[1][0];
  const c = m[0][1];
  const d = m[1][1];
  const sx = Math.hypot(a, b);
  const sy = Math.hypot(c, d);
  const rotation = (Math.atan2(b, a) * 180) / Math.PI;
  return { rotation, scale: [sx, sy], translation: [m[0][2], m[1][2]] };
}

function TransformBoxLiveOverlay({
  transform,
  op,
}: {
  transform: AffineTransform;
  op: string;
}) {
  const d = decomposeAffineForDisplay(transform);
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 space-y-0.5 rounded-md border border-zinc-200 bg-white/95 px-2 py-1 font-mono text-[11px] text-zinc-700 shadow backdrop-blur">
      <div>op: {op}</div>
      <div>
        a={transform[0][0].toFixed(3)} b={transform[1][0].toFixed(3)} c=
        {transform[0][1].toFixed(3)} d={transform[1][1].toFixed(3)}
      </div>
      <div>
        tx={transform[0][2].toFixed(3)} ty={transform[1][2].toFixed(3)}
      </div>
      <div>
        rot={d.rotation.toFixed(1)}° scale=[{d.scale[0].toFixed(2)},
        {d.scale[1].toFixed(2)}]
      </div>
    </div>
  );
}

/**
 * Two-layer image overlay aligned to the transform-box's frame.
 *
 *   Layer 1 (ghost): full image at opacity 0.5, NOT clipped — extends
 *                    past the parent rect so the user can see where the
 *                    transform is going.
 *   Layer 2 (clear): same image, clipped by `overflow: hidden` on the
 *                    parent-rect wrapper — the "real" image as it would
 *                    render inside the frame.
 *
 * Both layers apply the same affine `input.transform` to the image via
 * CSS `matrix()`, with translation components denormalized by the
 * frame's screen-px size (mirrors how the math primitive denormalizes
 * to pixel-space). The frame wrapper itself rotates by `input.rotation`.
 */
function TransformBoxImageOverlay({
  input,
  state,
  clipped,
}: {
  input: TransformBoxInput | null;
  state: HUDPlaygroundState | null;
  /** When false (free-transform case), the clear layer's wrapper does
   *  NOT clip — the whole image renders. The ghost layer is also
   *  suppressed (no frame → no overflow to ghost into). */
  clipped: boolean;
}) {
  if (!input || !state) return null;
  // Camera transform: doc → screen. Off-diagonals always 0 (no camera
  // rotation in this demo); read scale + translate from the diagonal.
  const camSx = state.transform[0][0];
  const camSy = state.transform[1][1];
  const camTx = state.transform[0][2];
  const camTy = state.transform[1][2];

  const originScreenX = input.origin[0] * camSx + camTx;
  const originScreenY = input.origin[1] * camSy + camTy;
  const frameW = input.size[0] * camSx;
  const frameH = input.size[1] * camSy;

  // CSS matrix(a, b, c, d, e, f) corresponds to:
  //   [a c e]
  //   [b d f]
  // Our AffineTransform shape is [[m00, m01, m02], [m10, m11, m12]],
  // and `m02 / m12` are normalized [0..1] against the box size — so
  // denormalize by (frameW, frameH) for the screen-px CSS matrix.
  const m = input.transform;
  const cssMatrix = `matrix(${m[0][0]}, ${m[1][0]}, ${m[0][1]}, ${m[1][1]}, ${m[0][2] * frameW}, ${m[1][2] * frameH})`;

  const imgStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: frameW,
    height: frameH,
    transform: cssMatrix,
    transformOrigin: "0 0",
    objectFit: "fill",
    userSelect: "none",
    pointerEvents: "none",
  };

  const frameWrapper: React.CSSProperties = {
    position: "absolute",
    left: originScreenX,
    top: originScreenY,
    width: frameW,
    height: frameH,
    transform: `rotate(${input.rotation ?? 0}deg)`,
    transformOrigin: "0 0",
    pointerEvents: "none",
  };

  return (
    <>
      {clipped ? (
        <>
          {/* Ghost — extends past the frame, opacity 0.5. */}
          <div style={{ ...frameWrapper, opacity: 0.5 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- dev showcase: image is being live-transformed; next/image fights interactive transforms */}
            <img
              src={TRANSFORM_BOX_DEMO_IMAGE}
              alt=""
              style={imgStyle}
              draggable={false}
            />
          </div>
          {/* Clear — clipped to the frame. Frame outline as a subtle
              border so the user sees the clipping boundary. */}
          <div
            style={{
              ...frameWrapper,
              overflow: "hidden",
              boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.1)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- dev showcase: image is being live-transformed; next/image fights interactive transforms */}
            <img
              src={TRANSFORM_BOX_DEMO_IMAGE}
              alt=""
              style={imgStyle}
              draggable={false}
            />
          </div>
        </>
      ) : (
        // Free-transform: no clipping frame — the image is the object
        // being transformed, not a paint inside a parent. One layer
        // only, full opacity.
        <div style={frameWrapper}>
          {/* eslint-disable-next-line @next/next/no-img-element -- dev showcase: image is being live-transformed; next/image fights interactive transforms */}
          <img
            src={TRANSFORM_BOX_DEMO_IMAGE}
            alt=""
            style={imgStyle}
            draggable={false}
          />
        </div>
      )}
    </>
  );
}

/**
 * Consumer #1: image-fit transform binding. Simulates the future
 * main-editor image-paint editor — the host binds the transform-box's
 * `transform` to a `cg.ImagePaint.transform` value.
 */
export function TransformBoxImageFitSection() {
  const [state, setState] = React.useState<HUDPlaygroundState | null>(null);
  const [transform, setTransform] =
    React.useState<AffineTransform>(IDENTITY_AFFINE);
  const [containerRotation, setContainerRotation] = React.useState<0 | 30 | 90>(
    0
  );
  const [enabled, setEnabled] = React.useState(true);
  const [lastOp, setLastOp] = React.useState<string>("(idle)");

  const fixture = React.useMemo(() => transformBoxFixture(), []);
  const r = TRANSFORM_BOX_FIXTURE_RECT;

  const transformBox = React.useMemo<TransformBoxInput | null>(() => {
    if (!enabled) return null;
    return {
      id: "image-fit-fixture",
      transform,
      size: [r.width, r.height],
      origin: [r.x, r.y],
      rotation: containerRotation,
    };
  }, [enabled, transform, containerRotation, r.height, r.width, r.x, r.y]);

  const handleTransformBox = React.useCallback((intent: Intent) => {
    if (intent.kind !== "transform_box") return;
    setTransform(intent.transform);
    setLastOp(
      intent.op.type === "translate"
        ? "translate"
        : intent.op.type === "scale_side"
          ? `scale_side(${intent.op.side})`
          : `rotate(${intent.op.corner})`
    );
  }, []);

  return (
    <Section anchor="transform-box">
      <SectionHeader
        eyebrow="Transform box"
        title="Affine transform box — a Layer B model"
      >
        Quad outline + 4 corner rotate handles + 4 side scale handles + body
        translate. The image is bound to the chrome&apos;s affine transform; the
        parent rect clips the &quot;real&quot; rendering and a 50% ghost shows
        the same image extending past the frame so you can see where the
        transform is going. Drag a corner to rotate, a side to scale on that
        axis, the body to translate. Toggle the container-rotation chip to
        exercise the de-rotation path. The HUD intent (`transform_box`) is
        target-agnostic — the same chrome would work against any 2×3 affine
        target.
      </SectionHeader>
      <SplitStage
        toolbar={
          <div className="flex flex-wrap items-center gap-3 px-1 text-[12px]">
            <div className="flex items-center gap-2">
              <Switch
                id="tb-flag"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
              <label
                htmlFor="tb-flag"
                className="cursor-pointer font-mono text-zinc-700"
              >
                setTransformBox input pushed
              </label>
            </div>
            <ModeChip
              label="Container rotation"
              value={String(containerRotation)}
              options={["0", "30", "90"]}
              onChange={(v) => setContainerRotation(Number(v) as 0 | 30 | 90)}
            />
            <button
              type="button"
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm hover:bg-zinc-50"
              onClick={() => setTransform(IDENTITY_AFFINE)}
            >
              reset transform
            </button>
          </div>
        }
        stage={
          <HUDStage
            fixture={fixture}
            transformBox={transformBox}
            onTransformBox={handleTransformBox}
            onState={setState}
          >
            <TransformBoxImageOverlay
              input={transformBox}
              state={state}
              clipped
            />
            <TransformBoxLiveOverlay transform={transform} op={lastOp} />
          </HUDStage>
        }
        inspector={<InspectorPanel state={state} title="Transform box" />}
      />
      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "Feature flag (schema-level)",
              rule: "Absence of `surface.setTransformBox(...)` input = no chrome rendered. No `enableTransformBox` boolean — the data IS the flag. Same pattern as `setPaddingOverlay` / `setCornerRadius`.",
            },
            {
              name: "Target-agnostic (Layer B doctrine)",
              rule: "The model is NOT image-specific. The intent's `id` lets the host route the resolved `transform` to whatever it bound to — `cg.ImagePaint.transform`, a node's local transform, a future free-transform tool. The input is marked `@unstable` until the main-editor image-paint editor migrates onto it — the contract is locked in only after ≥2 internal consumers shape it.",
            },
            {
              name: "Geometry",
              rule: "Box-relative affine — translation components ([0][2], [1][2]) normalized [0..1] against `size`. Pipeline: box_local → transform → +rotation around origin → +origin → doc-space.",
            },
            {
              name: "Hit-priority (corner > side > body)",
              rule: "TRANSFORM_BOX_CORNER_PRIORITY=13 wins over corner-radius (15). TRANSFORM_BOX_SIDE_PRIORITY=14. TRANSFORM_BOX_BODY_PRIORITY=38 beats marquee/translate-body, loses to every resize.",
            },
            {
              name: "Hit asymmetry (D3 — Layer B doctrine)",
              rule: "Visible stroke: 1px (selectionOutlineWidth). Hit strip: 12px thick (Fitts'-reach). Corner hit AABB: 16×16 (≥ MIN_HIT_SIZE). Hit strictly contains the rendered bbox — the pinning test for the asymmetric-outputs discipline.",
            },
            {
              name: "Cursors — rotation-aware",
              rule: "Side hit → resize cursor tilted by the box's effective screen-space rotation (`container.rotation + decompose(transform).rotation`). Corner hit → rotate-arc cursor with the same baseAngle. Mirrors `resize_handle.baseAngle` / `rotate_handle.baseAngle` on selection chrome — the cursor stays aligned to the visual axis at any rotation.",
            },
            {
              name: "Intent",
              rule: "`transform_box { id, op: { type, side?/corner? }, transform, phase }`. HUD has already reduced — host commits `transform` directly. `op` carries TYPE and TARGET only (no pointer delta — D1: subscribe to outcomes, not events).",
            },
            {
              name: "Container rotation",
              rule: "When `input.rotation !== 0`, the gesture's doc-space cursor delta is de-rotated by `-rotation` before being fed to the Layer A reducer. The intent's `transform` stays in box-relative space — the host re-applies its container rotation on the next push.",
            },
            {
              name: "Math primitive (Layer A)",
              rule: "`reduceTransformBox(base, action, {size})` — pure, exported from `@grida/hud`. The same reducer is the engine behind this chrome and behind any host's own non-UI transform manipulation.",
            },
          ]}
        />
      </div>
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Size meter
// ───────────────────────────────────────────────────────────────────────────

export function SizeMeterSection() {
  // Animated rotation so the OBB-aligned label visibly tracks the lowest
  // visual edge through every angle. Full revolution every 8 seconds.
  const [angle, setAngle] = React.useState(0);
  React.useEffect(() => {
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(t) {
      setAngle((((t - start) % 8000) / 8000) * Math.PI * 2);
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  const fixture = React.useMemo(() => rotatedRectFixture(angle), [angle]);
  const [state, setState] = React.useState<HUDPlaygroundState | null>(null);
  const extra = React.useCallback<HUDExtraBuilder>(
    (ctx) => buildSizeMeterExtra(ctx.fixture, ctx.selection) ?? undefined,
    []
  );
  return (
    <Section anchor="size-meter">
      <SectionHeader eyebrow="Size meter" title="W × H, on the lowest OBB edge">
        Host-fed pill that reads the selection's local width × height. For
        axis-aligned rects it sits below the bottom edge; for rotated /
        transformed selections it picks the visually-lowest edge of the OBB and
        the label rotates with the artwork. The rect below is rotating — watch
        which edge the pill snaps to as it spins.
      </SectionHeader>
      <SplitStage
        stage={<HUDStage fixture={fixture} extra={extra} onState={setState} />}
        inspector={<InspectorPanel state={state} title="Size meter" />}
      />
      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "Label",
              rule: "Local width × height, formatted to one decimal. Always the artwork's own dims — not the AABB of the rotated rect.",
            },
            {
              name: "Anchor",
              rule: "Visually-lowest OBB edge. Computed by projecting all four local corners through the matrix and picking the edge with the largest midpoint Y.",
            },
            {
              name: "labelAngle",
              rule: "Set to the edge's screen-space angle so the renderer's perpendicular offset (LABEL_OFFSET = 16 screen-px) rotates outward.",
            },
            {
              name: "Multi-selection",
              rule: "Union bbox W × H — placed at the bottom-center of the union, in container space. No labelAngle (the union is always axis-aligned).",
            },
          ]}
        />
      </div>
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Snap
// ───────────────────────────────────────────────────────────────────────────

export function SnapSection() {
  // Static preview — two rects sharing top + bottom edges. The snap rules
  // paint along the shared Y axes, same visual the live snap pipeline
  // produces during a translate that lands on those alignments.
  const fixture = React.useMemo(() => snapDemoFixture(), []);
  const [state, setState] = React.useState<HUDPlaygroundState | null>(null);
  const extra = React.useCallback<HUDExtraBuilder>(
    () => buildSnapStaticExtra(),
    []
  );
  return (
    <Section anchor="snap">
      <SectionHeader eyebrow="Snap" title="Edge / center alignment guides">
        Full-viewport rules drawn at every doc-space offset where a dragged
        shape's edge or center lines up with a neighbour's. The svg-editor emits
        these live during translate, resize, and insert gestures; the static
        preview below shows the visual the user sees when an alignment claims
        the drag.
      </SectionHeader>
      <SplitStage
        stage={<HUDStage fixture={fixture} extra={extra} onState={setState} />}
        inspector={<InspectorPanel state={state} title="Snap" />}
      />
      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "Primitive",
              rule: "HUDRule { axis, offset, color }. Full viewport extent in screen-space; offset is doc-space.",
            },
            {
              name: "Triggers",
              rule: "Computed by the host's translate / resize / insert orchestrators against the active drag's neighbour set, then projected world → screen via the camera.",
            },
            {
              name: "Built-in helper",
              rule: "@grida/hud exports snapGuideToHUDDraw(snapResult) which lifts the host's snap result into the HUDDraw shape the renderer expects.",
            },
          ]}
        />
      </div>
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Measurement
// ───────────────────────────────────────────────────────────────────────────

// Measurement-demo color. Matches the production host's measurement accent
// (`WorkbenchColors.red`) — same red the editor uses for distance overlays.
const MEASUREMENT_COLOR = "#EF4444";

/**
 * Resolve a fixture node's current doc-space rect, folding in any in-flight
 * translate offset. After a translate commits, HUDStage writes the offset
 * into its `liveFixture` and clears it from `offsets`; during the drag,
 * the offset is here but the fixture rect is still the pre-drag value. Sum
 * them so the measurement reads the same rect the user sees on screen.
 */
function liveRectOf(
  fixture: Fixture,
  id: string,
  offsets: Record<string, [number, number]>
): cmath.Rectangle | null {
  const node = fixture.nodes.find((n) => n.id === id);
  if (!node?.rect) return null;
  const off = offsets[id];
  if (!off) return { ...node.rect };
  return {
    x: node.rect.x + off[0],
    y: node.rect.y + off[1],
    width: node.rect.width,
    height: node.rect.height,
  };
}

export function MeasurementSection() {
  // Two rects, both translatable. The measurement extra recomputes every
  // frame from their live geometry — drag either rect and the 4-side
  // distance, labels, and auxiliary extensions follow.
  const fixture = React.useMemo(() => measurementDemoFixture(), []);
  const [state, setState] = React.useState<HUDPlaygroundState | null>(null);
  const extra = React.useCallback<HUDExtraBuilder>((ctx) => {
    const a = liveRectOf(ctx.fixture, "meas-a", ctx.offsets);
    const b = liveRectOf(ctx.fixture, "meas-b", ctx.offsets);
    if (!a || !b) return undefined;
    const m = measure(a, b);
    if (!m) return undefined;
    // Pure host composition: cmath does the geometry, hud's
    // `measurementToHUDDraw` flattens it into the draw command list. The
    // demo doesn't gate on Alt — it's always-on so the affordance the
    // section pins (rectangle-to-rectangle distance) is what the reader
    // sees while they translate the rects around.
    return measurementToHUDDraw(m, MEASUREMENT_COLOR);
  }, []);
  return (
    <Section anchor="measurement">
      <SectionHeader
        eyebrow="Measurement"
        title="Distance between two rectangles"
      >
        The 4-side distance overlay: a guide line per non-zero side from the
        base rect outward, labelled with the distance, plus a dashed auxiliary
        line where the rectangles don't share that edge. In production, the host
        gates this on alt-hover (selection ≠ hover). In this demo it's always-on
        — drag either rect and watch every guide, label, and auxiliary line
        recompute live.
      </SectionHeader>
      <SplitStage
        stage={<HUDStage fixture={fixture} extra={extra} onState={setState} />}
        inspector={<InspectorPanel state={state} title="Measurement" />}
      />
      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "Primitive",
              rule: "Two stroked HUDRects + up to 4 labelled HUDLines (guide lines, one per non-zero side) + up to 4 dashed auxiliary lines.",
            },
            {
              name: "Movement",
              rule: "Extra builder reads ctx.fixture + ctx.offsets every frame, folds the in-flight translate dx/dy into both rects, and re-runs cmath.measure. No bespoke listener — the recompute is just the same builder firing on the next draw.",
            },
            {
              name: "Trigger",
              rule: "Production: Alt held + idle gesture, selection ≠ hover, both non-empty; cleared on Alt release or hover-out. Demo: always-on (no gating) — keeps the affordance visible while the reader experiments.",
            },
            {
              name: "Label",
              rule: "Per-side distance, formatted to one decimal. Skipped for zero-distance sides (when the rects share an edge along that axis).",
            },
            {
              name: "Built-in helper",
              rule: "@grida/hud exports measurementToHUDDraw(measurement) which lifts the cmath measurement value into the HUDDraw shape the renderer expects.",
            },
          ]}
        />
      </div>
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Visibility groups — host policy
// ───────────────────────────────────────────────────────────────────────────

// Per-gesture hidden set. Mirrors the policy in `VisibilitySection.visibility`
// — keep the two in sync. `hidesOn` is empty for groups the policy never
// touches (hover / marquee / lasso); those stay visible whenever they have
// reason to render.
const VISIBILITY_GROUPS: { name: string; hidesOn: ReadonlyArray<string> }[] = [
  { name: "selection", hidesOn: ["translate"] },
  { name: "selectionControls", hidesOn: ["translate"] },
  { name: "sizeMeter", hidesOn: ["translate"] },
  { name: "hover", hidesOn: [] },
  { name: "marquee", hidesOn: [] },
  { name: "lasso", hidesOn: [] },
];

function GroupLegend({
  gestureKind,
  policyOn,
}: {
  gestureKind: string;
  policyOn: boolean;
}) {
  return (
    <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-200 bg-white/95 p-2 text-[11px] shadow-md backdrop-blur">
      <span className="mr-1 font-mono text-zinc-500">
        gesture: <span className="text-zinc-900">{gestureKind}</span>
      </span>
      {VISIBILITY_GROUPS.map((g) => {
        const hidden = policyOn && g.hidesOn.includes(gestureKind);
        return (
          <span
            key={g.name}
            className={[
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono",
              hidden
                ? "border-rose-200 bg-rose-50 text-rose-500 line-through decoration-rose-400/80"
                : "border-emerald-200 bg-emerald-50 text-emerald-700",
            ].join(" ")}
            title={hidden ? "hidden by policy" : "rendering"}
          >
            <span
              className={[
                "inline-block size-1.5 rounded-full",
                hidden ? "bg-rose-400" : "bg-emerald-500",
              ].join(" ")}
            />
            {g.name}
          </span>
        );
      })}
    </div>
  );
}

export function VisibilitySection() {
  // The interesting case for visibility groups is the asymmetric rule the
  // svg-editor actually uses: hide selection / selectionControls / sizeMeter
  // during TRANSLATE (so the moving silhouette stays clean), but keep the
  // sizeMeter visible during RESIZE — that's where its W × H readout
  // matters most. The fixture is just a single rect; the demo is about
  // which chrome stays when, not the geometry.
  const fixture = React.useMemo(() => singleRectFixture(220, 140), []);
  const [state, setState] = React.useState<HUDPlaygroundState | null>(null);
  const [policyOn, setPolicyOn] = React.useState(true);
  const groups = React.useMemo(
    () => ({
      selection: "selection",
      selectionControls: "selectionControls",
      hover: "hover",
      marquee: "marquee",
      lasso: "lasso",
    }),
    []
  );
  // Mount the size-meter as host extra so the demo has a third chrome
  // family to filter. The line carries `group: "sizeMeter"` (see
  // `buildSizeMeterExtra`); the policy below filters by that tag.
  const extra = React.useCallback<HUDExtraBuilder>(
    (ctx) => buildSizeMeterExtra(ctx.fixture, ctx.selection) ?? undefined,
    []
  );
  const visibility = React.useCallback<SurfaceVisibilityPolicy>(
    (ctx) => {
      if (!policyOn) return undefined;
      // Translate is the only gesture this policy filters on. During
      // resize, idle, rotate, marquee, etc. nothing is hidden — the
      // size meter shows its live W × H while resizing, which is the
      // whole point of having a separate group for it.
      if (ctx.gesture.kind !== "translate") return undefined;
      return { hidden: ["selection", "selectionControls", "sizeMeter"] };
    },
    [policyOn]
  );
  const gestureKind = state?.gesture?.kind ?? "idle";
  return (
    <Section anchor="visibility">
      <SectionHeader
        eyebrow="Visibility groups"
        title="Suppress chrome families per-gesture, without re-wiring draws"
      >
        Hosts assign string group names to chrome slots via{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          SurfaceOptions.groups
        </code>{" "}
        — and tag their own host-fed extras with{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          {`{ group: "..." }`}
        </code>{" "}
        — then return a hidden-set from{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          SurfaceOptions.visibility
        </code>{" "}
        per-gesture. The hud package never owns the vocabulary; hosts name their
        own. The svg-editor uses this for an asymmetric rule: during{" "}
        <strong>translate</strong> the silhouette goes clean ({" "}
        <code>selection</code>, <code>selectionControls</code>, and{" "}
        <code>sizeMeter</code> all vanish ), but during <strong>resize</strong>{" "}
        the size meter stays — that&apos;s when its W × H readout matters.
        Select the rect, then drag the body (translate) vs. a handle (resize)
        and watch the legend.
      </SectionHeader>
      <SplitStage
        toolbar={
          <ToggleChip
            label="Apply visibility policy"
            checked={policyOn}
            onCheckedChange={setPolicyOn}
          />
        }
        stage={
          <HUDStage
            fixture={fixture}
            groups={groups}
            visibility={visibility}
            extra={extra}
            onState={setState}
          >
            <GroupLegend gestureKind={gestureKind} policyOn={policyOn} />
          </HUDStage>
        }
        inspector={<InspectorPanel state={state} title="Visibility" />}
      />
      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "Group tagging",
              rule: "The hud package does not define group names. Hosts stamp strings onto built-in chrome via SurfaceOptions.groups and onto their own extras via the primitive's `group` field.",
            },
            {
              name: "filterHUDDrawByGroup",
              rule: "On each draw, the surface walks every primitive in built-in chrome + extras and drops the ones whose group is in `hidden`. Unrelated extras pass through untouched. Returns undefined when every primitive is hidden.",
            },
            {
              name: "translate-hide rule",
              rule: "When gesture.kind === 'translate', hide selection + selectionControls + sizeMeter. The moving silhouette renders alone.",
            },
            {
              name: "resize-keep rule (the asymmetry)",
              rule: "Every other gesture — resize, rotate, idle, marquee — pass through unfiltered. The size meter is mounted as a host extra (one HUDLine tagged group: 'sizeMeter') and benefits directly: hidden during translate, on-screen during resize, where its live W × H reading is what the user is watching.",
            },
            {
              name: "Pass-through",
              rule: "Built-in groups the policy never names (hover, marquee, lasso) stay under their own visibility rules — they paint when they have reason to, regardless of gesture.",
            },
          ]}
        />
      </div>
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Pixel grid
// ───────────────────────────────────────────────────────────────────────────

export function PixelGridSection() {
  const fixture = React.useMemo(() => pixelGridFixture(), []);
  const [state, setState] = React.useState<HUDPlaygroundState | null>(null);
  // Pre-zoom 6× so the grid is visible without the user having to
  // scroll-zoom first. Centered on (260, 250) so the bottom-band 40×40
  // tiles sit roughly in the viewport center at this zoom level.
  const initialTransform = React.useMemo<cmath.Transform>(
    () => [
      [6, 0, -1260],
      [0, 6, -1270],
    ],
    []
  );
  const zoom = state?.zoom ?? 6;
  const overThreshold = zoom >= 4;
  return (
    <Section anchor="pixel-grid">
      <SectionHeader
        eyebrow="Pixel grid"
        title="Back-most chrome — visible past the zoom threshold"
      >
        Pixel grid is a named built-in chrome behind selection chrome. The host
        configures via{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          setPixelGrid({"{ enabled, zoomThreshold }"})
        </code>
        . The grid only paints when{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          transform[0][0] &gt; zoomThreshold
        </code>{" "}
        — below that it costs zero. The canvas below opens pre-zoomed past the
        threshold so the grid is visible immediately; ⌘/ctrl + wheel to zoom out
        and watch it vanish at 4×.
      </SectionHeader>
      <SplitStage
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <ZoomBadge zoom={zoom} threshold={4} />
            <span className="text-[11px] text-zinc-500">
              {overThreshold
                ? "Grid is painting — every 1-unit world step renders as a faint line."
                : "Below 4× — grid is gated off (zero paint cost)."}
            </span>
          </div>
        }
        stage={
          <HUDStage
            fixture={fixture}
            pixelGrid
            initialTransform={initialTransform}
            onState={setState}
          />
        }
        inspector={<InspectorPanel state={state} title="Pixel grid" />}
      />
      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "zoomThreshold gate",
              rule: "Below the threshold the grid does not paint. Default threshold 4× in production hosts.",
            },
            {
              name: "Transform sync",
              rule: "setPixelGridTransform(transform) is called per camera tick; HUDCanvas internally merges with the chrome transform so the grid stays in world coordinates.",
            },
          ]}
        />
      </div>
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Cursors
// ───────────────────────────────────────────────────────────────────────────

const ROTATE_CORNERS: { corner: string; deg: number; label: string }[] = [
  { corner: "nw", deg: -45, label: "rotate-nw" },
  { corner: "ne", deg: 45, label: "rotate-ne" },
  { corner: "se", deg: 135, label: "rotate-se" },
  { corner: "sw", deg: -135, label: "rotate-sw" },
];

const RESIZE_DIRECTIONS: { dir: string; deg: number; label: string }[] = [
  { dir: "e", deg: 0, label: "ew" },
  { dir: "n", deg: 90, label: "ns" },
  { dir: "ne", deg: -45, label: "nesw" },
  { dir: "nw", deg: 45, label: "nwse" },
];

function CursorTile({ svg, label }: { svg: string; label: string }) {
  // Render the cursor SVG inline (24×24) so the user sees the exact glyph
  // the hud emits to the OS at idle baseAngle.
  return (
    <div className="flex flex-col items-center gap-1 rounded-md border border-zinc-200 bg-white p-2">
      <div
        className="size-7 [&>svg]:size-full"
        // SVGs come from @grida/hud/cursors — fixed Grida palette, no host
        // input — safe to inline.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <span className="font-mono text-[10px] text-zinc-600">{label}</span>
    </div>
  );
}

function formatCursor(c: HUDPlaygroundState["cursor"] | undefined): string {
  if (!c) return "—";
  if (typeof c === "string") return c;
  if (c.kind === "resize") return `resize-${c.direction}`;
  return `rotate-${c.corner}`;
}

function CursorGallery() {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        Every glyph the surface can emit
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Rotate (4)
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {ROTATE_CORNERS.map((c) => (
              <CursorTile
                key={c.corner}
                svg={hud_cursors.templates.rotate(c.deg)}
                label={c.label}
              />
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Resize (4 bidirectional)
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {RESIZE_DIRECTIONS.map((d) => (
              <CursorTile
                key={d.dir}
                svg={hud_cursors.templates.resize(d.deg)}
                label={d.label}
              />
            ))}
          </div>
        </div>
        <div className="col-span-2 space-y-1.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Native-CSS passthrough
          </div>
          <div className="flex flex-wrap gap-1.5 font-mono text-[11px] text-zinc-700">
            {[
              "default",
              "pointer",
              "move",
              "crosshair",
              "grab",
              "grabbing",
              "text",
            ].map((c) => (
              <span
                key={c}
                className="rounded-md border border-zinc-200 bg-white px-2 py-1 shadow-sm"
                style={{ cursor: c }}
              >
                {c}
              </span>
            ))}
          </div>
          <div className="text-[10px] text-zinc-500">
            Hover any chip to see the native cursor — the hud emits this CSS
            keyword verbatim.
          </div>
        </div>
      </div>
    </div>
  );
}

export function CursorsSection() {
  const fixture = React.useMemo(() => rotatedRectFixture(0.2), []);
  const [state, setState] = React.useState<HUDPlaygroundState | null>(null);
  const [rotationAware, setRotationAware] = React.useState(true);
  return (
    <Section anchor="cursors">
      <SectionHeader eyebrow="Cursors" title="Rotation-aware, tree-shake-safe">
        The surface owns cursor state via{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          surface.cursor()
        </code>{" "}
        but not cursor pixels. Hosts that want Grida's Figma-style rotation
        cursors wire the opt-in subpath:{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          surface.setCursorRenderer(cursors.defaultRenderer())
        </code>
        . The gallery below shows every glyph at idle baseAngle; toggle the live
        demo to swap to the native CSS fallback.
      </SectionHeader>
      <div className="mb-4">
        <CursorGallery />
      </div>
      <SplitStage
        toolbar={
          <ToggleChip
            label="Use rotation-aware SVG cursors"
            checked={rotationAware}
            onCheckedChange={setRotationAware}
          />
        }
        stage={
          <HUDStage
            fixture={fixture}
            rotationAwareCursors={rotationAware}
            onState={setState}
          >
            <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-zinc-200 bg-white/95 px-2 py-1 font-mono text-[11px] text-zinc-700 shadow backdrop-blur">
              live cursor:{" "}
              <span className="text-zinc-900">
                {formatCursor(state?.cursor)}
              </span>
            </div>
          </HUDStage>
        }
        inspector={<InspectorPanel state={state} title="Cursors" />}
      />
      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "Native CSS passthrough",
              rule: "default, pointer, move, crosshair, grab, grabbing, text — emitted as the matching CSS cursor: keyword.",
            },
            {
              name: "Rotate (4 per-corner)",
              rule: "Four distinct curved-arrow SVGs, one per RotationCorner. baseAngle adds the live rotation angle so the cursor tracks mid-drag.",
            },
            {
              name: "Resize (8 bidirectional)",
              rule: "Opposite directions share the SVG (the arrow is bidirectional). Per-direction fallback to native cursor keyword.",
            },
            {
              name: "Rotation bucket → no thrash",
              rule: "Mid-rotate cursor updates are bucketed by angle. Sub-bucket drift does not re-emit, so the cursor doesn't redraw on every move.",
            },
            {
              name: "Tree-shake invariant",
              rule: "Nothing in surface/, event/, or primitives/ may import from cursors/. Hosts that don't import the subpath pay zero bundle cost.",
            },
            {
              name: "Deterministic",
              rule: "Same input → same output. Repeated calls return identical strings so React Object.is bail-outs work.",
            },
          ]}
        />
      </div>
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Click tracker
// ───────────────────────────────────────────────────────────────────────────

// Floating count pill at the last click site. Solid blue inside the 250 ms
// window (matches the click-tracker rule), then fades to a white pip over
// ~950 ms so the spatial pattern of multi-clicks reads at idle. Drives its
// own RAF until the badge fully decays.
function ClickBadge({ state }: { state: HUDPlaygroundState | null }) {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const t = state?.lastClickAt ?? null;
  const x = state?.lastClickX;
  const y = state?.lastClickY;
  React.useEffect(() => {
    if (t === null) return;
    let raf = 0;
    const loop = () => {
      if (performance.now() - t > 1200) return;
      force();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [t]);
  if (
    t === null ||
    x === null ||
    y === null ||
    x === undefined ||
    y === undefined
  )
    return null;
  const age = performance.now() - t;
  if (age > 1200) return null;
  const opacity = age <= 250 ? 1 : Math.max(0, 1 - (age - 250) / 950);
  const scale = age <= 80 ? 1 + (1 - age / 80) * 0.4 : 1;
  const ring =
    age <= 250
      ? "ring-2 ring-blue-500 bg-blue-500 text-white"
      : "ring-1 ring-zinc-300 bg-white text-zinc-700";
  return (
    <div
      className={`pointer-events-none absolute flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-lg tabular-nums ${ring}`}
      style={{
        left: x,
        top: y,
        transform: `translate(-50%, -140%) scale(${scale})`,
        opacity,
      }}
    >
      <span className="opacity-70">×</span>
      {state?.clickCount ?? 1}
    </div>
  );
}

export function ClickTrackerSection() {
  // Deliberately empty — the click tracker is a hud-internal counter; it
  // does not emit any host intent on its own. Putting a node in the
  // fixture would suggest "double-click does something to the node",
  // which is false in this demo. The badge is the only thing being shown.
  const fixture = React.useMemo(() => emptyFixture(), []);
  const [state, setState] = React.useState<HUDPlaygroundState | null>(null);
  return (
    <Section anchor="click-tracker">
      <SectionHeader
        eyebrow="Click tracker"
        title="Canvas-tuned 250ms / 4-px double-click window"
      >
        The surface ships its own click counter, tuned for canvas workflows
        (faster human rhythm than the OS default 500ms). Clicks within 250ms and
        4 px of each other count up; otherwise the counter resets. Double-click
        is what drives{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          enter_content_edit
        </code>{" "}
        in production; this demo just shows the count.
      </SectionHeader>
      <SplitStage
        toolbar={
          <span className="text-[11px] text-zinc-500">
            Click twice within 250 ms and 4 px → ×2 · keep clicking to count up
            · move &gt; 4 px or wait &gt; 250 ms to reset
          </span>
        }
        stage={
          <HUDStage fixture={fixture} onState={setState}>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-md border border-dashed border-zinc-300 px-3 py-1.5 text-[11px] font-medium text-zinc-500">
                Double-click anywhere
              </div>
            </div>
            <ClickBadge state={state} />
          </HUDStage>
        }
        inspector={<InspectorPanel state={state} title="Click" />}
      />
      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "250 ms window",
              rule: "Two clicks 250 ms apart count as a double (boundary inclusive). 300 ms apart does not. 500 ms (OS default) does not — the canvas beats the OS clock.",
            },
            {
              name: "4 px distance window",
              rule: "If the cursor moves more than 4 px between clicks, the counter resets to 1. Spatial decay defeats accidental double-click from drift.",
            },
            {
              name: "Multi-click counts up",
              rule: "Counter goes 1 → 2 → 3 → … each click inside the window. Triple-click is observable; the host decides what to do with it.",
            },
            {
              name: "Per-button isolation",
              rule: "The counter tracks each pointer button independently. A primary then secondary does not register as a double.",
            },
          ]}
        />
      </div>
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// StandardSection — thin wrapper around Section + SectionHeader + SplitStage
// + SpecTable. Used by sections that don't need the full bespoke layout the
// large interactive demos build by hand.
// ───────────────────────────────────────────────────────────────────────────

function StandardSection({
  anchor,
  eyebrow,
  title,
  prose,
  toolbar,
  stage,
  inspector,
  rows,
}: {
  anchor: string;
  eyebrow: string;
  title: string;
  prose: React.ReactNode;
  toolbar?: React.ReactNode;
  stage: React.ReactNode;
  inspector: React.ReactNode;
  rows?: SpecRow[];
}) {
  return (
    <Section anchor={anchor}>
      <SectionHeader eyebrow={eyebrow} title={title}>
        {prose}
      </SectionHeader>
      <SplitStage toolbar={toolbar} stage={stage} inspector={inspector} />
      {rows ? (
        <div className="mt-6">
          <SpecTable rows={rows} />
        </div>
      ) : null}
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// §15 — Corner radius. Built-in hud chrome.
//
// Hud paints the handles + runs the gesture. The host (this section)
// owns the four radii and the policy that turns each intent into a
// state mutation:
//   - `corner_radius`            — default drag. Host applies to ALL when
//                                  pre-drag all-equal, else to the named
//                                  anchor only.
//   - `corner_radius_explicit`   — alt-held drag. ALWAYS the named anchor.
//   - `corner_radius_uniform`    — line-geometry drag. ALWAYS all four.
//
// The toggle below ("rect" vs "line") swaps the geometry the host hands
// the hud — same rect underneath, two different ways to express the
// radius parameter in space. With `rect` geometry and four equal radii,
// the hud collapses to a single center handle and resolves the drag's
// anchor from direction after a small threshold (see
// `cornerRadiusHandlePosRect` JSDoc in @grida/hud).
// ───────────────────────────────────────────────────────────────────────────

type CornerRadii = { tl: number; tr: number; br: number; bl: number };

// Geometric max for a rounded-rect corner radius — the closest-edge
// half. Past this the arcs would overlap their neighbours. At this
// value, knob pairs along the SHORTER axis coincide (oblong: TL+BL
// share one point, TR+BR share another); a square at this value
// collapses all four to the rect's center. Both rects in the combo
// demo share the same 200×120 dimensions so the cap is the same.
const CR_MAX_RADIUS =
  Math.min(
    CORNER_RADIUS_COMBO_LEFT_RECT.width,
    CORNER_RADIUS_COMBO_LEFT_RECT.height
  ) / 2;

function radiiAllEqual(r: CornerRadii): boolean {
  return r.tl === r.tr && r.tr === r.br && r.br === r.bl;
}

function clampRadius(v: number): number {
  return Math.max(0, Math.min(v, CR_MAX_RADIUS));
}

export function CornerRadiusSection() {
  return (
    <Section anchor="corner-radius">
      <SectionHeader eyebrow="Corner radius" title="Per-corner radius handles">
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          surface.setCornerRadius
        </code>{" "}
        — corner-radius chrome on two rects in one canvas (axis-aligned +
        rotated). Each knob sits at its corner&apos;s ARC CENTER, offset by{" "}
        <code>r</code> in BOTH x and y from the corner toward the interior;
        position <em>is</em> the radius value, and the rotated rect&apos;s knobs
        ride the rotated diagonals via the input&apos;s{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">transform</code>.
        Internally this API is a thin adapter over the universal parametric
        handle primitive (see the next section); the 43-test corner-radius
        behavior pin proves the equivalence.
      </SectionHeader>

      <CornerRadiusComboDemo />

      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "Corner-radius wrapper",
              rule: (
                <>
                  <code>surface.setCornerRadius</code> is a thin adapter — its
                  public types and the three <code>corner_radius*</code> intent
                  kinds are unchanged from pre-migration. Internally, every
                  input is composed by a local <code>cornerRadiusHandles</code>{" "}
                  helper next to the primitive and routed through the universal
                  parametric handle. The 43-test corner-radius behavior pin (
                  <code>__tests__/corner-radius.test.ts</code>) is the
                  equivalence proof.
                </>
              ),
            },
            {
              name: "Arc-center position",
              rule: (
                <>
                  Each knob sits at the rounded corner&apos;s{" "}
                  <em>arc center</em> — offset by radius <code>r</code> in BOTH
                  x and y from its corner, toward the rect interior. Translates
                  to a segment curve from corner → (corner + (max, max) · sign)
                  with <code>value = r</code>,{" "}
                  <code>domain.max = min(w,h)/2</code>.
                </>
              ),
            },
            {
              name: "Coincidence groups (declarative)",
              rule: (
                <>
                  Groups are an opt-in attribute on the input:{" "}
                  <code>{`{ ids: [...], policy: "direction-resolved" }`}</code>.
                  When ALL members are within ε of each other in doc-space, the
                  producer registers ONE hit region for the group; direction
                  resolution picks among the listed candidates only.
                  Corner-radius declares its 4-corner group so a single knob
                  drives all four when they&apos;re equal.
                </>
              ),
            },
            {
              name: "Snap-back inset",
              rule: (
                <>
                  Producer-side floor: at rest, the knob is floored to{" "}
                  <code>inset</code> in the track&apos;s own units. During a
                  gesture the floor is lifted. The "16 px per axis" UX
                  convention computes <code>inset = 16 · √2 / zoom</code> per
                  frame (the diagonal track at 45° turns a per-axis pixel into{" "}
                  <code>√2</code> along the track) before populating the field.
                </>
              ),
            },
            {
              name: "Intents",
              rule: (
                <>
                  Three named kinds: <code>corner_radius</code> (all-or-named,
                  default drag), <code>corner_radius_explicit</code>{" "}
                  (alt-modifier, always named anchor),{" "}
                  <code>corner_radius_uniform</code> (line geometry, always
                  all). Preserved for backward compat — see{" "}
                  <code>CHECKPOINT-setCornerRadius.md</code>.
                </>
              ),
            },
          ]}
        />
      </div>
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Parametric handles — the agnostic primitive underlying corner-radius.
// The star demo proves the same primitive composes for an arbitrary shape
// HUD knows nothing about.
// ───────────────────────────────────────────────────────────────────────────

export function ParametricHandlesSection() {
  return (
    <Section anchor="parametric-handles">
      <SectionHeader
        eyebrow="Parametric handles"
        title="The agnostic primitive — scalar on a 1D manifold"
      >
        HUD&apos;s universal &quot;scalar-on-a-1D-manifold&quot; primitive,{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          surface.setParametricHandles
        </code>
        . One or more handles, each a scalar <code>value</code> constrained to a
        1D <code>curve</code>. The corner-radius affordance above is a thin
        wrapper over this; the demo below uses the primitive <em>directly</em>{" "}
        on a shape HUD knows nothing about — a parametric star, rendered on a
        custom <code>&lt;canvas&gt;</code> underlay (no SVG fixture), with three
        handles: tip-radius (one segment handle per outer tip), inner / outer
        ratio (segment from center to a tip), and point-count (a stepped arc
        around the center, snapping to integers). The host paints the star, HUD
        paints the knobs, intents flow.
      </SectionHeader>

      <ParametricStarDemo />

      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "Primitive",
              rule: (
                <>
                  <code>
                    surface.setParametricHandles(input | input[] | null)
                  </code>{" "}
                  — one or more handles, each a scalar <code>value</code>{" "}
                  constrained to a 1D <code>curve</code>. Two curve kinds today:{" "}
                  <code>segment</code> (corner-radius, ratio) and{" "}
                  <code>arc</code> (count). Use-case composers (like the
                  corner-radius one) live next to their callers and build the
                  input from shape-specific schemas; the producer never knows
                  what shape the host is editing.
                </>
              ),
            },
            {
              name: "Curve kinds (segment + arc)",
              rule: (
                <>
                  <code>{`segment(a, b)`}</code> and{" "}
                  <code>{`arc(center, radius, from, to)`}</code>. Projection
                  delegates to <code>cmath.ui.projectPointOnCurve</code>;
                  evaluate via <code>cmath.ui.evaluateCurve</code>. Future curve
                  kinds (polyline, bezier) extend the union without breaking
                  consumers — each adds one case to two pure functions.
                </>
              ),
            },
            {
              name: "Stepped domains",
              rule: (
                <>
                  <code>domain.step</code> snaps the EMITTED value during
                  projection. The star demo&apos;s point-count handle uses{" "}
                  <code>{`{ min: 3, max: 12, step: 1 }`}</code> on an arc curve
                  — the knob can hover continuously around the arc, but the
                  intent payload always carries an integer.
                </>
              ),
            },
            {
              name: "Intent",
              rule: (
                <>
                  Universal API: <code>parametric_handle</code> with{" "}
                  <code>{`{ node_id, handle_id, value, modifiers: { alt, shift }, phase }`}</code>
                  . Modifier policy lives in the host — the producer reports
                  flags, the host&apos;s reducer decides "all vs one,"
                  "broadcast vs explicit," etc.
                </>
              ),
            },
          ]}
        />
      </div>
    </Section>
  );
}

// ── Demo A — rect geometry, two rects in one canvas ───────────────────────
//
// LEFT  — axis-aligned oblong; RIGHT — same oblong rotated about its
// center. Both rects are editable at once via the multi-input form of
// `surface.setCornerRadius(...)` (an array, one entry per node). The
// host owns two independent radii states and routes intents by the
// emitted `node_id` — proving that the chrome's geometry, snap-back,
// and coincidence behaviors don't get tangled when multiple inputs
// share a viewport.

const COMBO_LEFT_ID = "combo-L";
const COMBO_RIGHT_ID = "combo-R";

function CornerRadiusComboDemo() {
  const [state, setState] = React.useState<HUDPlaygroundState | null>(null);
  const [radiiL, setRadiiL] = React.useState<CornerRadii>({
    tl: 0,
    tr: 0,
    br: 0,
    bl: 0,
  });
  const [radiiR, setRadiiR] = React.useState<CornerRadii>({
    tl: 0,
    tr: 0,
    br: 0,
    bl: 0,
  });
  const [angleDeg, setAngleDeg] = React.useState(20);
  const angleRad = (angleDeg * Math.PI) / 180;

  const fixture = React.useMemo(
    () => cornerRadiusComboFixture(radiiL, radiiR, angleRad),
    [radiiL, radiiR, angleRad]
  );
  const transformR = React.useMemo(
    () => cornerRadiusComboRightTransform(angleRad) as cmath.Transform,
    [angleRad]
  );
  // Two inputs in one array — hud renders both sets of chrome at once
  // and routes pointer hits to the right one by hit-zone position.
  // Intents carry their own `node_id` so the host's reducer knows
  // which radii state to mutate.
  const cornerRadius = React.useMemo(
    () =>
      [
        {
          node_id: COMBO_LEFT_ID,
          geometry: {
            kind: "rect" as const,
            rect: { ...CORNER_RADIUS_COMBO_LEFT_RECT },
          },
          radius: radiiL,
        },
        {
          node_id: COMBO_RIGHT_ID,
          geometry: {
            kind: "rect" as const,
            rect: { ...CORNER_RADIUS_COMBO_RIGHT_RECT },
            transform: transformR,
          },
          radius: radiiR,
        },
      ] as const,
    [radiiL, radiiR, transformR]
  );

  const onCornerRadius = React.useCallback((intent: Intent) => {
    if (
      intent.kind !== "corner_radius" &&
      intent.kind !== "corner_radius_explicit"
    )
      return;
    const set = intent.node_id === COMBO_LEFT_ID ? setRadiiL : setRadiiR;
    const value = clampRadius(intent.value);
    if (intent.kind === "corner_radius") {
      set((prev) =>
        radiiAllEqual(prev)
          ? { tl: value, tr: value, br: value, bl: value }
          : { ...prev, [anchorKey(intent.anchor)]: value }
      );
    } else {
      set((prev) => ({ ...prev, [anchorKey(intent.anchor)]: value }));
    }
  }, []);

  const resetAll = () => {
    const zero = { tl: 0, tr: 0, br: 0, bl: 0 };
    setRadiiL(zero);
    setRadiiR(zero);
  };
  const maxAll = () => {
    const max = {
      tl: CR_MAX_RADIUS,
      tr: CR_MAX_RADIUS,
      br: CR_MAX_RADIUS,
      bl: CR_MAX_RADIUS,
    };
    setRadiiL(max);
    setRadiiR(max);
  };

  return (
    <DemoFrame
      eyebrow="Demo A · rect geometry (axis-aligned + rotated)"
      title="Two rects, one canvas — arc-center handles, snap-back, oblong coincidence"
      toolbar={
        <>
          <label className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px]">
            <span className="text-zinc-500">right angle</span>
            <input
              type="range"
              min={-90}
              max={90}
              value={angleDeg}
              onChange={(e) => setAngleDeg(Number(e.target.value))}
              className="w-32"
            />
            <code className="font-mono text-[11px] tabular-nums">
              {angleDeg}°
            </code>
          </label>
          <button
            type="button"
            onClick={resetAll}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50"
          >
            Reset both
          </button>
          <button
            type="button"
            onClick={maxAll}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50"
            title="Push every handle on both rects to its max — triggers the oblong-max coincidence on each"
          >
            Max both
          </button>
          <code className="font-mono text-[11px] tabular-nums text-zinc-600">
            L({radiiL.tl.toFixed(0)},{radiiL.tr.toFixed(0)},
            {radiiL.br.toFixed(0)},{radiiL.bl.toFixed(0)}) · R(
            {radiiR.tl.toFixed(0)},{radiiR.tr.toFixed(0)},{radiiR.br.toFixed(0)}
            ,{radiiR.bl.toFixed(0)})
          </code>
        </>
      }
      stage={
        <HUDStage
          fixture={fixture}
          cornerRadius={cornerRadius}
          onCornerRadius={onCornerRadius}
          onState={setState}
          interactionLocked
        />
      }
      inspector={<InspectorPanel state={state} title="Combo (L + R)" />}
    />
  );
}

// ── Demo B — parametric star: three handles via the universal primitive ──
//
// Replaces the previous "line-geometry on a star tooth" demo. The
// payback for the migration: the star is rendered by a custom
// `<canvas>` underlay (no SVG fixture) and hud paints THREE handles
// through the universal `surface.setParametricHandles` API:
//
//   1. **corner-radius** — ONE segment handle riding the radius axis
//      from `outerTip(0)` toward the star center (NOT along the
//      tip→valley edge). The handle visualizes the corner-radius
//      shared by every tip.
//   2. **inner/outer ratio** — one segment handle from the star
//      center to `outerTip(0)`. Value = `innerR`, domain `[0, outerR]`.
//   3. **point count** — one ARC handle riding the OUTER RING
//      (radius = `STAR_OUTER`, from `= -π/2`). At count=3 (`t=0`)
//      the knob sits exactly on `outerTip(0)` — a real polygon
//      vertex. Domain stepped to integers `[3..12]`.
//
// Demonstrates: segment + arc curves on the same input, stepped
// domains, and a host that paints content hud doesn't know about.

const STAR_CX = 280;
const STAR_CY = 200;
const STAR_OUTER = 90;
// `outerTip(0)` for `rotation=0` — first tip points UP from the
// center. The corner-radius handle anchors here; the ratio handle's
// bisector axis runs upper-right from the center.
const STAR_TIP0_ANGLE = -Math.PI / 2;

// Count-handle range. The count handle uses a `discrete` curve — its
// manifold is the pre-computed set of `outerTip(1)` positions for
// every integer count in `[STAR_COUNT_MIN, STAR_COUNT_MAX]`. Gesture
// snaps the knob to the nearest of those points; rendered position
// is always EXACTLY on a real tip of a hypothetical N-pointed star.
const STAR_COUNT_MIN = 3;
const STAR_COUNT_MAX = 50;
const STAR_COUNT_TIP1_POINTS: cmath.Vector2[] = Array.from(
  { length: STAR_COUNT_MAX - STAR_COUNT_MIN + 1 },
  (_, i) => {
    const N = STAR_COUNT_MIN + i;
    const angle = STAR_TIP0_ANGLE + (2 * Math.PI) / N;
    return [
      STAR_CX + STAR_OUTER * Math.cos(angle),
      STAR_CY + STAR_OUTER * Math.sin(angle),
    ];
  }
);

function ParametricStarDemo() {
  const [state, setState] = React.useState<HUDPlaygroundState | null>(null);
  const [cornerRadius, setCornerRadius] = React.useState(0);
  const [innerR, setInnerR] = React.useState(40);
  const [pointCount, setPointCount] = React.useState(5);

  const fixture = React.useMemo(() => emptyFixture(), []);

  const star = React.useMemo(
    () =>
      new ParametricStar({
        cx: STAR_CX,
        cy: STAR_CY,
        outerR: STAR_OUTER,
        innerR,
        points: pointCount,
      }),
    [innerR, pointCount]
  );

  // Three parametric inputs declared as a single multi-handle input
  // on one logical node ("star"). Each handle has its own id; the
  // host's reducer routes by id.
  //
  // Visual layout matches Figma's star handles: corner-radius lives
  // at the TOP tip (`outerTip(0)`); ratio + count both anchor at the
  // RIGHT tip (`outerTip(1)`). With rotation=0:
  //   - tip 0 is at angle -π/2 (top)
  //   - tip 1 is at angle -π/2 + 2π/N — its position shifts as N
  //     changes; for N=4 it's exactly right, for N=5 slightly
  //     above-right, etc.
  const parametricHandles = React.useMemo<ParametricHandleInput>(() => {
    const tip0: cmath.Vector2 = [STAR_CX, STAR_CY - STAR_OUTER];
    // The first inner vertex — the polygon vertex between tip 0 and
    // tip 1, on the bisector at distance `innerR` from center. The
    // ratio handle's natural anchor: dragging it changes innerR
    // (visualized as the knob sliding along the bisector axis from
    // center toward this vertex).
    const innerValleyAngle = STAR_TIP0_ANGLE + Math.PI / pointCount;
    const innerValleyAxisEnd: cmath.Vector2 = [
      STAR_CX + STAR_OUTER * Math.cos(innerValleyAngle),
      STAR_CY + STAR_OUTER * Math.sin(innerValleyAngle),
    ];
    // Corner-radius handle — segment from outerTip(0) inward along
    // the tip's radius (bisector). Travels TOWARD the star center,
    // NOT along the tip→valley edge. Cap at `outerR - innerR` so the
    // rounded corner can't grow past the inner ring (a clean
    // geometric ceiling even though the true tangent-circle cap is
    // sharper — the demo doesn't care about exact star geometry).
    const cornerRadiusMax = Math.max(0, STAR_OUTER - innerR);
    const cornerRadiusHandle = {
      id: "corner-radius",
      track: {
        kind: "segment" as const,
        a: tip0,
        b: [STAR_CX, STAR_CY - innerR] as cmath.Vector2,
      },
      value: cornerRadius,
      domain: { min: 0, max: cornerRadiusMax },
      inset: 16,
    };
    // Ratio handle — slider along the BISECTOR axis between tip 0
    // and tip 1, ending at the equivalent outer-radius distance. At
    // value=innerR, the knob lands exactly on the first inner vertex
    // (`innerValleyAfterTip(0)`) — a real polygon vertex. Matches
    // Figma's ratio chip position.
    const ratioHandle = {
      id: "ratio",
      track: {
        kind: "segment" as const,
        a: [STAR_CX, STAR_CY] as cmath.Vector2,
        b: innerValleyAxisEnd,
      },
      value: innerR,
      domain: { min: 0, max: STAR_OUTER },
    };
    // Count handle — `points` track (a `cmath.ui.PointSet`, NOT a
    // curve — point sets are the discrete sibling of curves; see
    // cmath's PointSet doc). The track IS the pre-computed set of
    // `outerTip(1)` positions, one per integer count. Gesture's
    // projection snaps the cursor to the nearest of these points;
    // the rendered knob is ALWAYS exactly on a real tip position.
    // No re-anchoring shim — render and gesture agree on the same
    // finite set of valid positions.
    const countHandle = {
      id: "count",
      track: {
        kind: "points" as const,
        points: STAR_COUNT_TIP1_POINTS,
      },
      value: pointCount,
      domain: { min: STAR_COUNT_MIN, max: STAR_COUNT_MAX },
    };
    return {
      node_id: "star",
      handles: [cornerRadiusHandle, ratioHandle, countHandle],
    };
  }, [cornerRadius, innerR, pointCount]);

  const onParametricHandle = React.useCallback((intent: Intent) => {
    if (intent.kind !== "parametric_handle") return;
    if (intent.handle_id === "corner-radius") {
      setCornerRadius(Math.max(0, intent.value));
    } else if (intent.handle_id === "ratio") {
      setInnerR(Math.max(0, Math.min(intent.value, STAR_OUTER)));
    } else if (intent.handle_id === "count") {
      // `discrete` curve already returns one of the pre-computed
      // point indices; the value maps directly to integer count.
      // Round defensively in case of host-side drift.
      setPointCount(
        Math.max(
          STAR_COUNT_MIN,
          Math.min(STAR_COUNT_MAX, Math.round(intent.value))
        )
      );
    }
  }, []);

  return (
    <DemoFrame
      eyebrow="Demo B · parametric star (custom canvas + 3 handles)"
      title="Parametric star — corner radius (segment), ratio (segment), count (arc)"
      toolbar={
        <>
          <button
            type="button"
            onClick={() => {
              setCornerRadius(0);
              setInnerR(40);
              setPointCount(5);
            }}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-700 hover:bg-zinc-50"
          >
            Reset
          </button>
          <code className="font-mono text-[11px] tabular-nums text-zinc-600">
            r={cornerRadius.toFixed(1)} · ratio=
            {(innerR / STAR_OUTER).toFixed(2)} · count={pointCount}
          </code>
        </>
      }
      stage={
        <HUDStage
          fixture={fixture}
          parametricHandles={parametricHandles}
          onParametricHandle={onParametricHandle}
          onState={setState}
          interactionLocked
          underlay={<StarCanvas star={star} state={state} />}
        />
      }
      inspector={<InspectorPanel state={state} title="Star" />}
    />
  );
}

// Custom <canvas> underlay for the star demo. Subscribes to
// HUDStage's onState to read camera transform + container size, and
// re-paints each frame via DPR-aware setTransform.
//
// Sits absolutely-positioned behind hud's overlay canvas — same
// transform, same size, same coordinate system.
function StarCanvas({
  star,
  state,
}: {
  star: ParametricStar;
  state: HUDPlaygroundState | null;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  // Track container size — DPR-aware backing store sized on resize.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.max(1, Math.round(size.width * dpr));
    canvas.height = Math.max(1, Math.round(size.height * dpr));
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Compose: device-pixel scaling × camera transform (doc → screen).
    // HUDStage's transform shape is `[[sx, _, tx], [_, sy, ty]]`
    // — `cmath.Transform` (2×3 affine, off-diagonals always 0 here).
    const cam = state?.transform ?? [
      [1, 0, 0],
      [0, 1, 0],
    ];
    const [[sx, , tx], [, sy, ty]] = cam;
    ctx.setTransform(dpr * sx, 0, 0, dpr * sy, dpr * tx, dpr * ty);
    star.paint(ctx, {
      fill: "rgba(99, 102, 241, 0.12)",
      stroke: "#6366f1",
      strokeWidth: 1.5 / Math.max(Math.abs(sx), 1e-6),
    });
  }, [size.width, size.height, star, state?.transform]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />
    </div>
  );
}

// ── Demo frame — a self-contained eyebrow + title + toolbar + stage + inspector
// block. Mirrors `SplitStage` but adds its own header so multiple demos can
// stack inside one section.

function DemoFrame({
  eyebrow,
  title,
  toolbar,
  stage,
  inspector,
}: {
  eyebrow: string;
  title: string;
  toolbar: React.ReactNode;
  stage: React.ReactNode;
  inspector: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-zinc-100 p-3 ring-1 ring-zinc-200/70">
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600">
          {eyebrow}
        </div>
        <div className="text-[13px] font-medium text-zinc-700">{title}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
        {toolbar}
      </div>
      <div className="flex h-[420px] flex-col gap-2 sm:flex-row">
        <div className="min-w-0 flex-1">{stage}</div>
        <div className="w-full sm:h-full sm:w-64 sm:shrink-0">{inspector}</div>
      </div>
    </div>
  );
}

function anchorKey(anchor: "nw" | "ne" | "se" | "sw"): keyof CornerRadii {
  return anchor === "nw"
    ? "tl"
    : anchor === "ne"
      ? "tr"
      : anchor === "se"
        ? "br"
        : "bl";
}

// All 8 cardinal directions, ordered along a compass ring so the chip reads
// naturally left-to-right. Matches `cmath.CardinalDirection` exactly.
const ASPECT_RATIO_DIRECTIONS = [
  "nw",
  "n",
  "ne",
  "w",
  "e",
  "sw",
  "s",
  "se",
] as const;

// Base rect for the aspect-ratio demo. The animation scales `BASE` between
// `ASPECT_RATIO_SCALE_MIN` and `ASPECT_RATIO_SCALE_MAX`, anchored at the
// point opposite the chosen direction. Width/height ratio is preserved —
// that *is* the affordance being demonstrated.
const ASPECT_RATIO_BASE = {
  x: 200,
  y: 170,
  width: 200,
  height: 120,
} as const;
const ASPECT_RATIO_SCALE_MIN = 0.55;
const ASPECT_RATIO_SCALE_MAX = 1.0;
const ASPECT_RATIO_PERIOD_MS = 2400;

/**
 * Given a base rect, a drag direction, and a uniform scale, return the rect
 * that results from a shift-resize gesture pulled in `direction`. The point
 * opposite the dragged corner/edge stays fixed (the resize origin); the
 * dragged corner/edge sweeps along the aspect-ratio diagonal.
 *
 * Edge directions also anchor at the opposite edge midpoint — both
 * dimensions still scale uniformly to preserve aspect ratio, matching how
 * production handles edge-drag with shift held.
 */
function resizedRectForDirection(
  base: { x: number; y: number; width: number; height: number },
  direction: cmath.CardinalDirection,
  scale: number
): { x: number; y: number; width: number; height: number } {
  const w = base.width * scale;
  const h = base.height * scale;
  const left = base.x;
  const right = base.x + base.width;
  const top = base.y;
  const bottom = base.y + base.height;
  const cx = base.x + base.width / 2;
  const cy = base.y + base.height / 2;
  switch (direction) {
    case "n":
      return { x: cx - w / 2, y: bottom - h, width: w, height: h };
    case "s":
      return { x: cx - w / 2, y: top, width: w, height: h };
    case "e":
      return { x: left, y: cy - h / 2, width: w, height: h };
    case "w":
      return { x: right - w, y: cy - h / 2, width: w, height: h };
    case "ne":
      return { x: left, y: bottom - h, width: w, height: h };
    case "nw":
      return { x: right - w, y: bottom - h, width: w, height: h };
    case "se":
      return { x: left, y: top, width: w, height: h };
    case "sw":
      return { x: right - w, y: top, width: w, height: h };
  }
}

export function AspectRatioSection() {
  const [state, setState] = React.useState<HUDPlaygroundState | null>(null);
  // The "dragged direction" — toggle simulates which corner/edge the user
  // would be pulling. Production gates this on `gesture.direction`; the
  // demo lets the reader scrub it.
  const [direction, setDirection] =
    React.useState<cmath.CardinalDirection>("se");
  // Animated scale, ping-ponging between MIN and MAX with a sine ease. The
  // canvas is non-interactive (interactionLocked) — the rect resizes itself
  // along the aspect-ratio trajectory so the reader can *see* the affordance
  // instead of imagining it. The opposite corner/edge stays pinned; the
  // dashed amber diagonal IS the path the dragged corner travels.
  const [scale, setScale] = React.useState(ASPECT_RATIO_SCALE_MAX);
  React.useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const phase = ((now - start) / ASPECT_RATIO_PERIOD_MS) * 2 * Math.PI;
      const t = (1 - Math.cos(phase)) / 2; // 0..1..0..1, eased
      setScale(
        ASPECT_RATIO_SCALE_MIN +
          (ASPECT_RATIO_SCALE_MAX - ASPECT_RATIO_SCALE_MIN) * t
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  // Rebuild the fixture each frame so the rect's geometry tracks the
  // animated scale. The hud reads the rect off the fixture and recomputes
  // selection chrome + the extra-builder diagonal accordingly.
  const fixture = React.useMemo<Fixture>(
    () => ({
      nodes: [
        {
          id: "card",
          kind: "rect-rounded",
          rect: resizedRectForDirection(ASPECT_RATIO_BASE, direction, scale),
          radius: 16,
          fill: "#FFFFFF",
          stroke: "#94A3B8",
        },
      ],
      initialSelection: ["card"],
    }),
    [direction, scale]
  );
  const extra = React.useCallback<HUDExtraBuilder>(
    (ctx) =>
      buildAspectRatioExtra(ctx.fixture, ctx.selection, direction) ?? undefined,
    [direction]
  );
  return (
    <StandardSection
      anchor="aspect-ratio"
      eyebrow="Aspect ratio"
      title="Aspect-ratio guide"
      prose={
        <>
          A dashed diagonal across the selection. Shown during a shift-resize
          gesture to communicate "this drag preserves the aspect ratio".
          Decorative — no hit-test. Pick a direction: the rect animates as if
          shift-resized from that corner/edge, the opposite point stays anchored
          as the resize origin, and the dashed amber line traces the dragged
          corner's trajectory.
          <span className="mt-2 block text-zinc-500">
            The 8-case{" "}
            <code className="rounded bg-zinc-100 px-1 text-[12px]">
              CardinalDirection → diagonal
            </code>{" "}
            table ships as{" "}
            <code className="rounded bg-zinc-100 px-1 text-[12px]">
              cmath.ui.diagonalForDirection
            </code>
            ; the render is a one-line host-side composition over{" "}
            <code className="rounded bg-zinc-100 px-1 text-[12px]">
              HUDLine
            </code>
            . No hud-side helper by design — see the package README's anti-goal{" "}
            <em>"Not a kitchen of decorative-line helpers."</em>
          </span>
        </>
      }
      toolbar={
        <ModeChip
          label="direction"
          value={direction}
          options={[...ASPECT_RATIO_DIRECTIONS]}
          onChange={(v) => setDirection(v as cmath.CardinalDirection)}
        />
      }
      stage={
        <HUDStage
          fixture={fixture}
          selection={["card"]}
          extra={extra}
          // The canvas is a player, not a workbench: no selection, no
          // translate, no marquee. The reader watches the resize; the only
          // input is the direction chip in the toolbar.
          interactionLocked
          onState={setState}
        />
      }
      inspector={<InspectorPanel state={state} title="Aspect ratio" />}
      rows={[
        {
          name: "Render",
          rule: "Dashed HUDLine across the selection. Endpoints from cmath.ui.diagonalForDirection — the 8-case table lives in cmath, not hud.",
        },
        {
          name: "Direction",
          rule: "Corner directions (ne/nw/se/sw) span opposite-corner → dragged-corner. Edge directions (n/s/e/w) resolve to a canonical diagonal.",
        },
        {
          name: "Resize origin",
          rule: "The point opposite the dragged direction stays fixed during the gesture — corners anchor opposite corners; edges anchor opposite edge midpoints. The animation makes this visible by pinning that point as the rect scales.",
        },
        {
          name: "Visibility",
          rule: "Production: only during resize gesture with shift held or a target aspect ratio set. Hidden otherwise. Host-gated, hud doesn't own this.",
        },
      ]}
    />
  );
}

// Strip width in CSS px. Must match the `strip` value passed to ruler config
// — every hit-region calculation below assumes the same number. Default ruler
// strip is also 20, so the demo can also drop `strip:` from config and inherit.
const RULER_STRIP = 20;

// Hit-radius along the cross-axis of a guide line, in screen px. ±4 px gives
// the user a 9-px-wide grab zone without bloating the visible line, mirroring
// how hud's own resize knobs separate render bbox from hit bbox.
const GUIDE_GRAB_PX = 4;

// Idle / hovered guide color. Matches WorkbenchColors.red — the production
// host's accent for guides / measurements (editor/grida-canvas-react/ui-config.ts).
const GUIDE_COLOR = "#f44336";
// Selected guide color. Matches WorkbenchColors.sky — production accent
// for the focused selection / highlight.
const GUIDE_SELECTED_COLOR = "#00a6f4";

// White is the natural ruler background — strip reads as chrome cleanly
// against any underlying viewport (light or dark content).
const RULER_STRIP_BG = "#FFFFFF";
// Mid-gray for ticks + labels. Matches @grida/ruler's default and the
// main editor's `<AxisRuler>` (which inherits the same default).
const RULER_INK = "rgba(128, 128, 128, 0.5)";
// Light gray for the inner-edge separator (the line where the strip
// meets the editing area). Distinctly lighter than the ticks — the
// universal "the strip ends here" affordance. Hex equivalent of
// `oklch(0.922 0 0)` = the main editor's `--border` token resolved
// against its light theme.
const RULER_BORDER = "#ebebeb";

// Axis convention — pinned to the production host (main editor
// `editor/grida-canvas-react/viewport/surface.tsx:2002, 2031`).
//   Top strip (cursor ns-resize) → drag DOWN → creates a HORIZONTAL guide → axis "y"
//   Left strip (cursor ew-resize) → drag RIGHT → creates a VERTICAL  guide → axis "x"
// Naming: "axis: x" means a line of constant x (vertical); "axis: y" means
// a line of constant y (horizontal). Same convention as `HUDRule.axis`.

type Guides = { x: number[]; y: number[] };
type GuideRef = { axis: "x" | "y"; idx: number };

export function RulerGuidesSection() {
  // Empty fixture — this section is about ruler + guides chrome; any
  // content shape would steal focus from the chrome under study.
  const fixture = React.useMemo(() => emptyFixture(), []);
  const [state, setState] = React.useState<HUDPlaygroundState | null>(null);
  const [guides, setGuides] = React.useState<Guides>({
    x: [200, 320],
    y: [180],
  });
  // Per-guide UI state — host-owned, hud knows nothing. Hover is the
  // ephemeral pointer-near-guide state (sets/clears via pointerenter/leave
  // on the grab strips). Selected is the persistent click state (set on
  // drag-start, cleared when the guide is deleted).
  const [hovered, setHovered] = React.useState<GuideRef | null>(null);
  const [selected, setSelected] = React.useState<GuideRef | null>(null);

  // Per-mark `RulerMark` is computed from `(pos, axis, idx, hovered, selected)`.
  // Three visual tiers:
  //
  //   idle      → red stroke, NO label    (default — quiet)
  //   hovered   → red stroke, label shown (eye is on it, value matters)
  //   selected  → blue stroke + label     (active target, drag will move it)
  //
  // Label sits to the RIGHT of the tick on the top strip — matches
  // `editor/grida-canvas-react/viewport/surface.tsx:2092` createTick which
  // passes textAlign "start" to the top ruler. textAlignOffset +4 gives a
  // small visible gap between the tick line and the first digit.
  // Left strip stays at textAlign "end" + 8 (the rotated rendering anchors
  // the label cleanly against the strip's inner edge with that offset).
  const ruler = React.useMemo(() => {
    const isMatch = (ref: GuideRef | null, axis: "x" | "y", idx: number) =>
      ref?.axis === axis && ref.idx === idx;
    const buildMark = (axis: "x" | "y", pos: number, idx: number) => {
      const isSelected = isMatch(selected, axis, idx);
      const isHovered = isMatch(hovered, axis, idx);
      const showLabel = isHovered || isSelected;
      const accent = isSelected ? GUIDE_SELECTED_COLOR : GUIDE_COLOR;
      return {
        pos,
        text: showLabel ? Math.round(pos).toString() : undefined,
        textAlign: (axis === "x" ? "start" : "end") as CanvasTextAlign,
        textAlignOffset: axis === "x" ? 4 : 8,
        strokeColor: accent,
        // Two-tier stroke width — matches main editor's createTick.
        //   idle      → 0.5 = DEFAULT_LINE_WIDTH (HUDDraw.rules uses the
        //               same value, so the strip tick + rule below it
        //               read as one continuous line at rest).
        //   hover/sel → 1.0 to give the active guide visual weight. The
        //               slight seam against the 0.5 rule is the standard
        //               "this one is active" affordance.
        strokeWidth: isHovered || isSelected ? 1 : 0.5,
        strokeHeight: RULER_STRIP,
        color: accent,
      };
    };
    return {
      strip: RULER_STRIP,
      backgroundColor: RULER_STRIP_BG,
      color: RULER_INK,
      borderColor: RULER_BORDER,
      marks: {
        x: guides.x.map((pos, idx) => buildMark("x", pos, idx)),
        y: guides.y.map((pos, idx) => buildMark("y", pos, idx)),
      },
    };
  }, [guides, hovered, selected]);

  // Guides as HUDDraw.rules — full-viewport rules in screen-space. Hud
  // paints them under the ruler strip automatically (ruler is the
  // top-most chrome since v0.x, see hud README §"Substrate vs frame"),
  // so the strip clips them visually without any host-side trimming.
  const extra = React.useCallback<HUDExtraBuilder>(() => {
    const isHovered = (axis: "x" | "y", idx: number) =>
      hovered?.axis === axis && hovered.idx === idx;
    const isSelected = (axis: "x" | "y", idx: number) =>
      selected?.axis === axis && selected.idx === idx;
    // Stroke width on the rule mirrors the corresponding RulerMark —
    // idle 0.5 (matches DEFAULT_LINE_WIDTH so the strip tick + rule
    // read as one continuous line), hover/select 1.0 to thicken the
    // active guide end-to-end (tick AND rule both bump).
    const widthFor = (axis: "x" | "y", idx: number) =>
      isHovered(axis, idx) || isSelected(axis, idx) ? 1 : 0.5;
    const colorFor = (axis: "x" | "y", idx: number) =>
      isSelected(axis, idx) ? GUIDE_SELECTED_COLOR : GUIDE_COLOR;
    return {
      rules: [
        ...guides.x.map((offset, idx) => ({
          axis: "x" as const,
          offset,
          color: colorFor("x", idx),
          strokeWidth: widthFor("x", idx),
        })),
        ...guides.y.map((offset, idx) => ({
          axis: "y" as const,
          offset,
          color: colorFor("y", idx),
          strokeWidth: widthFor("y", idx),
        })),
      ],
    };
  }, [guides, hovered, selected]);

  return (
    <Section anchor="ruler-guides">
      <SectionHeader
        eyebrow="Ruler & guides"
        title="Built-in ruler chrome + host-owned guide state"
      >
        Ruler is named built-in chrome — same shape as pixel-grid, opposite slot
        in the paint order: pixel-grid is the substrate (back-most), ruler is
        the frame (top-most, above every other chrome and host extra). The host
        calls{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          surface.setRuler({"{ enabled, marks, backgroundColor, ... }"})
        </code>
        ; hud paints the L-shape strip, tracks the camera through{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          setRulerTransform
        </code>
        , and accent-paints any host-supplied marks. Guide state is host-owned —
        this demo keeps a{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          {"{ x: number[], y: number[] }"}
        </code>{" "}
        in React state and feeds the lines through{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          HUDDraw.rules
        </code>
        ; the ruler strip naturally clips them. Axis convention matches the main
        editor: drag from the top strip creates a horizontal (y) guide; drag
        from the left strip creates a vertical (x) guide. Drag an existing guide
        to move. Drag a guide back into the strip to delete.
      </SectionHeader>
      <SplitStage
        toolbar={
          <span className="text-[11px] text-zinc-500">
            Drag the top strip down → horizontal guide · drag the left strip
            right → vertical guide · hover a guide to show its value · drag to
            select (turns blue) and move · drag back to a strip to delete ·
            ⌘/ctrl + wheel to zoom
          </span>
        }
        stage={
          <HUDStage
            fixture={fixture}
            ruler={ruler}
            extra={extra}
            onState={setState}
          >
            <RulerGuideInteractions
              strip={RULER_STRIP}
              transform={state?.transform}
              guides={guides}
              setGuides={setGuides}
              setHovered={setHovered}
              setSelected={setSelected}
            />
          </HUDStage>
        }
        inspector={<InspectorPanel state={state} title="Ruler & guides" />}
      />
      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "setRuler / setRulerTransform",
              rule: "Mirror of setPixelGrid's API shape: enable, optional camera transform, host owns marks/ranges. Paint slot is opposite — ruler is top-most, pixel-grid is back-most.",
            },
            {
              name: "Substrate vs frame",
              rule: "Pixel grid is a substrate — content-space lines that read 'under' the document. Ruler is a frame — viewport-space chrome that bounds the editing area like a title bar. Two different constraints earn two different paint slots; hud locks the order.",
            },
            {
              name: "L-shape (top + left)",
              rule: "Both axes paint in one pass; the corner square is intentionally blank. axes: ['x'] | ['y'] | ['x','y'] picks the strips to render.",
            },
            {
              name: "1-2-5 step ladder",
              rule: "Major-tick step is the smallest in the series whose on-screen spacing ≥ 50 px; subticks auto-derive from the leading digit when enabled.",
            },
            {
              name: "Guide state is host-owned",
              rule: "Hud has no setGuides / no GuideOverlay / no drag intent. The demo keeps {x, y} in React state and overlays its own hit regions; create / move / delete are pure setState updates. The lines themselves go through HUDDraw.rules — hud renders them under the ruler.",
            },
            {
              name: "Axis convention",
              rule: 'Top strip → "y" guide (horizontal); left strip → "x" guide (vertical). Matches the production wiring in editor/grida-canvas-react/viewport/surface.tsx where bindX calls surfaceStartGuideGesture("y", -1) and bindY calls ("x", -1).',
            },
            {
              name: "Overlay children compose cleanly",
              rule: "HUDStage binds its pointer listeners on the canvas, not the container. Overlay children (interaction layer, badges, legends) are siblings of the canvas in the DOM — pointer events on them physically never reach hud's listeners, so children can handle their own events with plain React handlers. No stopPropagation gymnastics, no risk of half-delivered gestures (down received, up swallowed) leaving hud's marquee stuck open.",
            },
            {
              name: "Per-guide UI state is host-side",
              rule: "Hovered + selected are host React state. Hud has no setHoveredGuide / no selection-mirror for guides. The host computes its per-frame RulerMark[] from (guides, hovered, selected) — idle marks are stroke-only, hovered marks add the label, selected marks switch to the accent color. The producer's job ended at exposing strokeColor / color / text on RulerMark; the host varies them.",
            },
            {
              name: "Drag threshold (4 px)",
              rule: "DEFAULT_RULER_DRAG_THRESHOLD is exported from @grida/hud — the recommended pointer-movement distance before a drag-from-strip commits a new guide (or a drag-from-guide moves it). Below the threshold, a click is just a click: 'new' mode creates nothing, 'move' mode promotes the guide to selected without moving it. Hud publishes the value because it's a property of the ruler chrome's UX, not any host's gesture engine — so the main editor and the demo can never drift.",
            },
          ]}
        />
      </div>
    </Section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// RulerGuideInteractions — transparent overlay above the HUDStage canvas.
//
// pointer-events: none on the wrapper means hud sees pointer events on
// every pixel where this overlay does NOT mount a hot region. Hot regions
// (the two ruler strips + a thin grab strip per existing guide) flip to
// pointer-events: auto and stopPropagation on pointerdown so hud's
// surface never sees the click that started a guide gesture.
//
// All state lives in the parent section — this component just translates
// pointer positions into setGuides calls. Hud is unaware that guides exist.
// ───────────────────────────────────────────────────────────────────────────

function RulerGuideInteractions({
  strip,
  transform,
  guides,
  setGuides,
  setHovered,
  setSelected,
}: {
  strip: number;
  transform: cmath.Transform | undefined;
  guides: Guides;
  setGuides: React.Dispatch<React.SetStateAction<Guides>>;
  setHovered: React.Dispatch<React.SetStateAction<GuideRef | null>>;
  setSelected: React.Dispatch<React.SetStateAction<GuideRef | null>>;
}) {
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  // Hover is suppressed during a drag — the dragged guide is already
  // visible as "selected" (blue), and pointer leaves on the grab strip
  // would otherwise flicker the hover state during the gesture.
  const draggingRef = React.useRef(false);

  if (!transform) return null;
  const sx = transform[0][0];
  const tx = transform[0][2];
  const ty = transform[1][2];

  // Local-canvas coords for a pointer event. Reads off the overlay's own
  // bounding rect so it stays correct under page scroll / zoom changes.
  const localXY = (e: PointerEvent | React.PointerEvent): [number, number] => {
    const el = overlayRef.current;
    if (!el) return [0, 0];
    const r = el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  // axis "x" → vertical guide → its position is read from the local X coord
  // axis "y" → horizontal guide → its position is read from the local Y coord
  const screenToDoc = (axis: "x" | "y", screen: number) =>
    axis === "x" ? (screen - tx) / sx : (screen - ty) / sx;

  // Hover handlers — only update state when we're not in the middle of a
  // drag. Otherwise the hover would flicker as the captured pointer
  // crosses other grab-strip elements.
  const onEnter = (axis: "x" | "y", idx: number) => {
    if (!draggingRef.current) setHovered({ axis, idx });
  };
  const onLeave = (axis: "x" | "y", idx: number) => {
    if (draggingRef.current) return;
    setHovered((curr) =>
      curr?.axis === axis && curr.idx === idx ? null : curr
    );
  };

  function beginDrag(
    e: React.PointerEvent<HTMLDivElement>,
    info: { axis: "x" | "y"; mode: "new" | "move"; idx: number }
  ) {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* Safari occasionally throws if the pointer just released — harmless. */
    }
    const startedPointerId = e.pointerId;
    const [startX, startY] = localXY(e);

    // Drag-threshold gate. The gesture only "starts" once the pointer
    // has moved DEFAULT_RULER_DRAG_THRESHOLD px (4) from pointer-down —
    // hud publishes the value as part of the ruler chrome's UX contract
    // so all hosts use the same number. Two reasons:
    //
    //   - "new" mode: a stray click on the strip shouldn't spawn a
    //     guide. Only an intentional drag-out commits.
    //   - "move" mode: a stray click on an existing guide shouldn't
    //     move it. Within the threshold, the gesture is just a click
    //     (which selects the guide on pointer-up).
    //
    // `started` flips to true the first move past the threshold, at
    // which point we create the new guide (if "new") and claim it as
    // selected. Hovered is suppressed for the rest of the gesture.
    let started = false;
    let activeIdx = info.idx;

    // Plain window listeners — no stopPropagation needed. HUDStage binds
    // its pointer listeners on the canvas, not on the container, so
    // events on this overlay (a sibling of the canvas) physically never
    // reach hud's gesture dispatch. See `_host.tsx` listener-target note.
    const onMove = (mv: PointerEvent) => {
      if (mv.pointerId !== startedPointerId) return;
      const [mx, my] = localXY(mv);

      if (!started) {
        const dx = mx - startX;
        const dy = my - startY;
        if (dx * dx + dy * dy < DEFAULT_RULER_DRAG_THRESHOLD ** 2) return;
        started = true;
        draggingRef.current = true;
        setHovered(null);
        if (info.mode === "new") {
          // Index BEFORE the append, so the setter writes to the right
          // slot regardless of strict-mode double-invocation.
          activeIdx = guides[info.axis].length;
          const doc = screenToDoc(info.axis, info.axis === "x" ? mx : my);
          setGuides((prev) => ({
            ...prev,
            [info.axis]: [...prev[info.axis], doc],
          }));
        }
        // Selection follows the drag once it commits — both for fresh
        // creates and existing-guide moves.
        setSelected({ axis: info.axis, idx: activeIdx });
        return;
      }

      // Threshold already crossed — normal drag update.
      const doc = screenToDoc(info.axis, info.axis === "x" ? mx : my);
      setGuides((prev) => ({
        ...prev,
        [info.axis]: prev[info.axis].map((v, i) => (i === activeIdx ? doc : v)),
      }));
    };

    const onUp = (up: PointerEvent) => {
      if (up.pointerId !== startedPointerId) return;

      if (!started) {
        // Click without drag. "new" mode: no guide was created, nothing
        // to commit. "move" mode: treat as a select-only click so the
        // user can tap an existing guide to make it active without
        // moving it.
        if (info.mode === "move") {
          setSelected({ axis: info.axis, idx: info.idx });
        }
      } else {
        // Drag occurred — check drop-to-delete.
        const [ux, uy] = localXY(up);
        const inHomeStrip =
          info.axis === "x" ? uy >= 0 && uy <= strip : ux >= 0 && ux <= strip;
        if (inHomeStrip) {
          setGuides((prev) => ({
            ...prev,
            [info.axis]: prev[info.axis].filter((_, i) => i !== activeIdx),
          }));
          // Splice invalidates the active index; clear or shift selection
          // so it keeps pointing at the right entry after the removal.
          setSelected((curr) => {
            if (!curr || curr.axis !== info.axis) return curr;
            if (curr.idx === activeIdx) return null;
            if (curr.idx > activeIdx)
              return { axis: curr.axis, idx: curr.idx - 1 };
            return curr;
          });
        }
      }

      draggingRef.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  return (
    <div ref={overlayRef} className="pointer-events-none absolute inset-0">
      {/* Guide LINES are NOT rendered here — they go through HUDDraw.rules
          (see RulerGuidesSection's `extra` builder) so hud paints them
          under the ruler chrome automatically. This component only owns
          interaction hit regions. */}

      {/* Top strip — drag DOWN creates a horizontal "y" guide. Cursor is
          ns-resize because the gesture moves vertically. */}
      <div
        className="pointer-events-auto absolute"
        style={{
          left: strip,
          right: 0,
          top: 0,
          height: strip,
          cursor: "ns-resize",
        }}
        onPointerDown={(e) => beginDrag(e, { axis: "y", mode: "new", idx: -1 })}
      />
      {/* Left strip — drag RIGHT creates a vertical "x" guide. Cursor is
          ew-resize because the gesture moves horizontally. */}
      <div
        className="pointer-events-auto absolute"
        style={{
          left: 0,
          width: strip,
          top: strip,
          bottom: 0,
          cursor: "ew-resize",
        }}
        onPointerDown={(e) => beginDrag(e, { axis: "x", mode: "new", idx: -1 })}
      />

      {/* Grab strips on each existing guide. ±4 px around the line. */}
      {guides.x.map((doc, i) => {
        const ssx = doc * sx + tx;
        return (
          <div
            key={`x-grab-${i}`}
            className="pointer-events-auto absolute"
            style={{
              top: strip,
              bottom: 0,
              left: ssx - GUIDE_GRAB_PX,
              width: GUIDE_GRAB_PX * 2,
              cursor: "ew-resize",
            }}
            onPointerEnter={() => onEnter("x", i)}
            onPointerLeave={() => onLeave("x", i)}
            onPointerDown={(e) =>
              beginDrag(e, { axis: "x", mode: "move", idx: i })
            }
          />
        );
      })}
      {guides.y.map((doc, i) => {
        const ssy = doc * sx + ty;
        return (
          <div
            key={`y-grab-${i}`}
            className="pointer-events-auto absolute"
            style={{
              left: strip,
              right: 0,
              top: ssy - GUIDE_GRAB_PX,
              height: GUIDE_GRAB_PX * 2,
              cursor: "ns-resize",
            }}
            onPointerEnter={() => onEnter("y", i)}
            onPointerLeave={() => onLeave("y", i)}
            onPointerDown={(e) =>
              beginDrag(e, { axis: "y", mode: "move", idx: i })
            }
          />
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// §17 Performance — N×N grid in the real svg-editor
//
// The hud package paints chrome around the SELECTION, not the scene; its
// per-frame work tracks selection size, not node count. To demonstrate
// THAT — not demo-side plumbing artifacts — we mount the production host
// (`@grida/svg-editor`, the same one §0 uses) with a procedurally-built
// N×N SVG. The svg-editor brings spatial indexes and DOM-side
// optimizations, so what the reader feels at N=50 (2500 nodes) is the
// hud chrome responding to hover / marquee / select-all, not demo
// plumbing.
//
// Earlier drafts ran this section on the showcase's own fixture host.
// FixtureSvg paints N² <rect>s per render and hitPick is O(n) linear-
// scan — those saturated before any hud cost ever showed up, so the
// "hud is fast" claim was untestable. Hosting on the real editor moves
// the variable being measured back onto the hud chrome.
// ───────────────────────────────────────────────────────────────────────────

const PERF_N_OPTIONS = [10, 20, 30, 40, 50] as const;

/**
 * Procedural SVG with `n × n` axis-aligned rects on a uniform pitch.
 * Sized to a 600×600 viewBox so the editor's `fit` zoom-to-content gives
 * the reader the whole grid at default zoom. Each rect carries an `id`
 * so multi-select chrome reads cleanly when the reader hits ⌘A.
 */
function buildGridSvg(n: number): string {
  const VB = 600;
  const PAD = 20;
  const usable = VB - PAD * 2;
  const pitch = usable / n;
  const cell = Math.max(1, pitch * 0.85);
  const rects: string[] = [];
  // Two-tone fill so the eye picks up a checker pattern — easier to
  // read selection chrome / marquee outlines against than uniform fill.
  const FILLS = ["#E2E8F0", "#CBD5E1"];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x = PAD + c * pitch;
      const y = PAD + r * pitch;
      const fill = FILLS[(r + c) % 2];
      rects.push(
        `<rect id="g-${r}-${c}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" fill="${fill}" stroke="#94A3B8" stroke-width="0.5"/>`
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB} ${VB}" width="${VB}" height="${VB}">${rects.join("")}</svg>`;
}

/**
 * 1-second rolling FPS counter driven by requestAnimationFrame. Reports
 * the inverse-mean frame delta in Hz plus the worst frame in the window.
 * Browser-overall metric — it doesn't isolate hud draw cost — but at large
 * N a janky pick / shapeOf path drags it down, and the readout makes that
 * legible to the reader without instrumentation in the package.
 */
function useFps(): { fps: number; worstMs: number } {
  const [stats, setStats] = React.useState({ fps: 60, worstMs: 0 });
  React.useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const samples: number[] = [];
    const WINDOW_MS = 1000;
    let windowStart = last;
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      samples.push(dt);
      if (t - windowStart >= WINDOW_MS) {
        const sum = samples.reduce((a, b) => a + b, 0);
        const mean = sum / samples.length;
        const worst = samples.reduce((a, b) => (b > a ? b : a), 0);
        setStats({ fps: 1000 / mean, worstMs: worst });
        samples.length = 0;
        windowStart = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return stats;
}

function FpsBadge({ fps, worstMs }: { fps: number; worstMs: number }) {
  // Green ≥ 55fps, amber ≥ 30, rose below. The threshold isn't a hud
  // contract — it's a legibility cue for the reader.
  const tier = fps >= 55 ? "ok" : fps >= 30 ? "warn" : "bad";
  const tone =
    tier === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tier === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-rose-200 bg-rose-50 text-rose-700";
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 font-mono text-[11px]",
        tone,
      ].join(" ")}
      title={`Worst frame in last window: ${worstMs.toFixed(1)} ms`}
    >
      <span className="text-zinc-500">fps</span>
      <span className="font-semibold tabular-nums">{fps.toFixed(0)}</span>
      <span className="text-zinc-400">·</span>
      <span className="text-zinc-500">worst</span>
      <span className="tabular-nums">{worstMs.toFixed(1)}ms</span>
    </span>
  );
}

export function PerformanceSection() {
  const [n, setN] = React.useState<number>(30);
  const svg = React.useMemo(() => buildGridSvg(n), [n]);
  const fps = useFps();
  const nodeCount = n * n;
  return (
    <Section anchor="performance">
      <SectionHeader
        eyebrow="Performance"
        title="N × N grid — chrome cost is selection-sized, not scene-sized"
      >
        Mounts the same{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">
          @grida/svg-editor
        </code>{" "}
        host as §0, against a procedurally-built grid. Crank{" "}
        <code className="rounded bg-zinc-100 px-1 text-[12px]">N</code> below
        and the node count quadruples, but the hud&apos;s per-frame work stays
        flat — its draw cost tracks <em>selection</em> size, not scene size. Hit{" "}
        <kbd>⌘A</kbd> at N=50 to put 2500 nodes in selection and watch the
        multi-select chrome render as one envelope. Marquee through the grid,
        resize the union, drag — the chrome is the same one shipped to
        production.
      </SectionHeader>
      <div className="rounded-2xl bg-zinc-100 p-2 ring-1 ring-zinc-200/70">
        <div className="flex flex-wrap items-center gap-2 px-2 pt-1 pb-2">
          <span className="text-[11px] font-mono text-zinc-500">N =</span>
          <div className="inline-flex overflow-hidden rounded-md border border-zinc-200 bg-white text-[11px] font-mono">
            {PERF_N_OPTIONS.map((opt, i) => (
              <button
                key={opt}
                type="button"
                onClick={() => setN(opt)}
                className={[
                  "px-2 py-1 transition-colors",
                  i === 0 ? "" : "border-l border-zinc-200",
                  n === opt
                    ? "bg-zinc-900 text-white"
                    : "bg-white text-zinc-700 hover:bg-zinc-50",
                ].join(" ")}
              >
                {opt}
              </button>
            ))}
          </div>
          <span className="text-[11px] font-mono text-zinc-500">
            nodes ={" "}
            <span className="tabular-nums text-zinc-900">{nodeCount}</span>
          </span>
          <FpsBadge fps={fps.fps} worstMs={fps.worstMs} />
          <span className="ml-auto text-[11px] text-zinc-500">
            try: hover · marquee-drag · ⌘A · resize union
          </span>
        </div>
        <div className="mt-2 h-[500px] overflow-hidden rounded-lg border border-zinc-200 bg-white">
          {/* `key={n}` re-mounts the provider when N changes, so the
              editor parses the new SVG from scratch. Cheaper to reason
              about than a hypothetical `replaceDocument`, and the user
              rarely flips N — so paying the parse on toggle is fine. */}
          <SvgEditorProvider key={n} initialSvg={svg}>
            <SvgEditorCanvas className="h-full w-full" fit />
          </SvgEditorProvider>
        </div>
      </div>
      <div className="mt-6">
        <SpecTable
          rows={[
            {
              name: "Hud draw cost",
              rule: "Per frame the surface paints chrome for the selection — selection bbox, 8 resize knobs, rotation regions, optional size meter — plus any host-fed extras and gestures-in-flight (marquee outline, snap rules, hover stripe). Cost is O(|selection|), independent of |scene|.",
            },
            {
              name: "Multi-select envelope",
              rule: "⌘A → the hud paints one selection envelope around the union bbox of every selected id. 1 node or 2500, that's still one rect + one set of knobs. The host computes the union once per selection change.",
            },
            {
              name: "Marquee under load",
              rule: "Drag an empty area to marquee-select. The hud emits one selection intent per frame; the host classifies node membership against its spatial index. The hud's marquee outline (one HUDRect) is constant-cost regardless of how many it ends up selecting.",
            },
            {
              name: "Why the real editor",
              rule: "Earlier drafts ran on the showcase fixture host — its FixtureSvg paints N² <rect>s per render and its hitPick is O(n) linear-scan, saturating before any hud cost showed up. Hosting on @grida/svg-editor (spatial indexes, optimized DOM) moves the variable back onto the hud chrome.",
            },
            {
              name: "FPS readout",
              rule: "1-second rolling rAF window — browser-overall. Useful for A/B-ing N values within this section. For hud-isolated numbers, see the package's own perf benches.",
            },
          ]}
        />
      </div>
    </Section>
  );
}

// "Not yet built" — the items that need new primitives or DOM escape
// hatches before the demo can prototype them.
export function NotYetBuiltSection() {
  return (
    <Section anchor="not-yet-built">
      <SectionHeader
        eyebrow="Not yet built"
        title="Open work — what hud needs next"
      >
        Items the main editor wires today but the demo cannot prototype with
        existing hud primitives. Each one is the spec for a future hud addition
        or a deliberate DOM escape hatch.
      </SectionHeader>
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white text-xs">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
                Item
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
                What it needs
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
                Note
              </th>
            </tr>
          </thead>
          <tbody>
            {NOT_YET_BUILT.map((item, i) => (
              <tr
                key={item.title}
                className={i === 0 ? "" : "border-t border-zinc-100"}
              >
                <td className="px-3 py-2 align-top text-sm font-semibold">
                  {item.title}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top">
                  <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700">
                    {item.tag}
                  </code>
                </td>
                <td className="px-3 py-2 align-top leading-relaxed text-zinc-700">
                  {item.note}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

const NOT_YET_BUILT: Array<{ title: string; tag: string; note: string }> = [
  {
    title: "Padding overlay (hatched)",
    tag: "new primitive",
    note: "Needs HUDRect.hatched { angle, spacing } — solid fill only today.",
  },
  {
    title: "Network curve",
    tag: "new primitive",
    note: "Bezier connector between nodes. Hud only has straight HUDLine.",
  },
  {
    title: "Network edge arrowhead",
    tag: "new primitive",
    note: "Composable from HUDLine; depends on the curve primitive landing first.",
  },
  {
    title: "Gradient stop editor",
    tag: "new primitive",
    note: "HUDLine with color-stop array, plus per-stop draggable knobs.",
  },
  {
    title: "Variable-width stroke stops",
    tag: "vector-chrome extension",
    note: "Per-vertex width handles along a path. Needs new VectorOverlay variant + new gesture.",
  },
  {
    title: "Image crop handles",
    tag: "new gesture mode",
    note: "Re-uses the resize 9-slice math, but the intent writes the crop rect, not the layer size.",
  },
  {
    title: "Locked indicator icon",
    tag: "primitive | DOM",
    note: "Either extend hud with HUDIcon (SVG path) or ship as a DOM badge.",
  },
  {
    title: "Node title bar / frame name",
    tag: "DOM escape hatch",
    note: "Text-heavy with double-click rename — canvas text is brittle.",
  },
  {
    title: "Component consumer badge",
    tag: "DOM escape hatch",
    note: "Small badge with icon; dblclick enters component via enter_content_edit.",
  },
  {
    title: "Text caret + selection range",
    tag: "DOM escape hatch",
    note: "Requires contenteditable / IME. Hud is not a text renderer.",
  },
  {
    title: "Distribute-evenly button",
    tag: "DOM escape hatch",
    note: "Interactive button positioned over the canvas.",
  },
  {
    title: "Floating toolbar",
    tag: "DOM escape hatch",
    note: "Contextual action bar above the selection.",
  },
  {
    title: "Dropzone indicator (drag-in)",
    tag: "host extra",
    note: "Container drop highlight while dragging a node from outside. Render with HUDRect fillOpacity; needs host-side drag-state plumbing.",
  },
  {
    title: "Group member outlines (mid-drag)",
    tag: "host extra",
    note: "Already implemented for selection; needed during gesture preview too.",
  },
  {
    title: "Sort handle (z-order swap dot)",
    tag: "host extra",
    note: "Render is a one-line HUDScreenRect (circle) at the right edge — already a trivial host composition. The unbuilt piece is the host-side drag-reorder gesture that swaps z-order with the neighbour; no hud primitive blocks it.",
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Extra-draw builders (host-pattern reference impls)
// ───────────────────────────────────────────────────────────────────────────

function selectedRect(
  fixture: Fixture,
  selection: string[]
): { x: number; y: number; width: number; height: number } | null {
  if (selection.length === 0) return null;
  const id = selection[0];
  const node = fixture.nodes.find((n) => n.id === id);
  return node?.rect ?? null;
}

function buildSizeMeterExtra(
  fixture: Fixture,
  selection: string[]
): HUDDraw | null {
  if (selection.length === 0) return null;
  const id = selection[0];
  const node = fixture.nodes.find((n) => n.id === id);
  if (!node?.rect) return null;
  const { x, y, width, height } = node.rect;
  const angle =
    node.kind === "rect-rotated" && node.angle !== undefined ? node.angle : 0;
  const label = `${Math.round(width)} × ${Math.round(height)}`;

  // CW traversal — TL → BL → BR → TR — so the renderer's perpendicular
  // (0, +LABEL_OFFSET) rotated by edge angle always points OUTWARD from
  // the rect interior. Mirrors svg-editor's pick_lowest_side_anchor.
  const localCorners: [number, number][] = [
    [x, y],
    [x, y + height],
    [x + width, y + height],
    [x + width, y],
  ];
  const cx = x + width / 2;
  const cy = y + height / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = localCorners.map<[number, number]>((p) => [
    cx + cos * (p[0] - cx) - sin * (p[1] - cy),
    cy + sin * (p[0] - cx) + cos * (p[1] - cy),
  ]);

  // Pick the edge whose midpoint has the largest doc-space Y — that's the
  // visually-lowest edge of the OBB.
  let bestIdx = 0;
  let bestY = -Infinity;
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const my = (a[1] + b[1]) / 2;
    if (my > bestY) {
      bestY = my;
      bestIdx = i;
    }
  }
  const A = corners[bestIdx];
  const B = corners[(bestIdx + 1) % 4];
  const edgeAngle = Math.atan2(B[1] - A[1], B[0] - A[0]);

  return {
    lines: [
      {
        x1: A[0],
        y1: A[1],
        x2: B[0],
        y2: B[1],
        label,
        labelAngle: edgeAngle,
        color: "#3B82F6",
        // Tag the size-meter chrome with a semantic group so hosts that
        // want to suppress it per-gesture (see §10) can route through
        // `SurfaceVisibilityPolicy` without re-wiring the extra builder.
        // Sections that don't set a visibility policy ignore the tag.
        group: "sizeMeter",
      },
    ],
  };
}

// Static snap visualization for §8. Matches the same shape svg-editor's
// snapGuideToHUDDraw emits: full-viewport rules along the aligned axes,
// plus crosshair pips (HUDPoint) at each corner that participates in the
// alignment — one on the agent (dragged) rect, one on the neighbour.
//
// snapDemoFixture:
//   A: x=100..220, y=180..280   (top-right=(220,180), bot-right=(220,280))
//   B: x=340..460, y=180..280   (top-left =(340,180), bot-left =(340,280))
// Top + bottom edges align → two rules at y=180 and y=280, four pips.
function buildSnapStaticExtra(): HUDDraw {
  const C = "#EF4444";
  return {
    rules: [
      { axis: "y", offset: 180, color: C },
      { axis: "y", offset: 280, color: C },
    ],
    points: [
      { x: 220, y: 180, color: C }, // A top-right
      { x: 340, y: 180, color: C }, // B top-left
      { x: 220, y: 280, color: C }, // A bottom-right
      { x: 340, y: 280, color: C }, // B bottom-left
    ],
  };
}

function buildAspectRatioExtra(
  fixture: Fixture,
  selection: string[],
  direction: cmath.CardinalDirection
): HUDDraw | null {
  const r = selectedRect(fixture, selection);
  if (!r) return null;
  // The 8-case direction→diagonal table lives in cmath, not here. The
  // affordance is a host-side composition of one existing hud primitive
  // (HUDLine) + the cmath geometry — refusing a hud-side helper is the
  // sdk-design decision pinned by hud's README anti-goals.
  const line = cmath.ui.diagonalForDirection(r, direction);
  return {
    lines: [
      {
        ...line,
        dashed: true,
        color: "#F59E0B",
      },
    ],
  };
}
