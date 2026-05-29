"use client";

// ───────────────────────────────────────────────────────────────────────────
// Dev showcase host — NOT a reference adapter.
//
// `HUDStage` is the thinnest possible consumer of `@grida/hud` for the
// `/packages/@grida/hud` spec page. It exists to render the section
// fixtures, not to be copied verbatim into a production host. The intent
// dispatcher, preview/commit state, and ref-mirrored selection live here
// in hooks because this is a dev page; a production host should lift
// that logic into a class against `Surface`'s imperative API so it can
// be tested and benchmarked (see `code-react` skill: hooks barred from
// load-bearing canvas logic).
//
// What the showcase does demonstrate honestly:
//   - an SVG underlay paints the toy scene (fixture)
//   - a canvas overlay drives the hud surface
//   - container pointer / wheel / keyboard events forward to `surface.dispatch`
//   - selection mirror + camera live in host state
//
// The surface owns gesture, hover, cursor, hit-test. The host owns
// document content, selection, camera. That separation is the real
// contract `@grida/hud` was built around — see the package README
// §"Layer responsibilities".
// ───────────────────────────────────────────────────────────────────────────

import * as React from "react";
import cmath from "@grida/cmath";
import {
  Surface,
  type CornerRadiusInput,
  type CursorIcon,
  type HUDDraw,
  type HUDStyle,
  type Intent,
  type Modifiers,
  type RulerConfig,
  type SelectionGroup,
  type SurfaceChromeGroups,
  type SurfaceEvent,
  type SurfaceGesture,
  type SurfaceVisibilityPolicy,
  type VectorOverlay,
} from "@grida/hud";
import { cursors as hud_cursors } from "@grida/hud/cursors";
import { fixtureToShape, type Fixture, type FixtureNode } from "./_fixtures";

type NodeId = string;

// Intent kinds that represent "free gestures" — the reader poking the
// canvas via selection chrome, marquee, or direct node manipulation.
// `interactionLocked` drops exactly these. Host-routed handle intents
// (corner-radius, parametric, padding, transform-box, …) and mode
// transitions pass through, so a new handle family doesn't need to
// remember to update a per-family allowlist here.
const FREE_GESTURE_INTENTS: ReadonlySet<Intent["kind"]> = new Set([
  "select",
  "deselect_all",
  "translate",
  "resize",
  "rotate",
  "marquee_select",
  "lasso_select",
  "set_endpoint",
]);

// ───────────────────────────────────────────────────────────────────────────
// Public state shape — what the inspector subscribes to.
// ───────────────────────────────────────────────────────────────────────────

export interface HUDPlaygroundState {
  selection: string[];
  hover: NodeId | null;
  gesture: SurfaceGesture;
  cursor: CursorIcon;
  lastIntent: Intent | null;
  modifiers: Modifiers;
  transform: cmath.Transform;
  zoom: number;
  /** Click count within the canvas-tuned 250ms / 4-px window. Surface's
   *  internal click-tracker isn't exposed; host mirror for demo display. */
  clickCount: number;
  /** Local-canvas coords of the last pointer-down + when it fired (perf.now).
   *  Both null until the first click. */
  lastClickX: number | null;
  lastClickY: number | null;
  lastClickAt: number | null;
}

/** Per-frame builder for a HUDDraw overlay layered above selection chrome. */
export type HUDExtraBuilder = (ctx: {
  selection: string[];
  transform: cmath.Transform;
  fixture: Fixture;
  gesture: SurfaceGesture;
  /** dx/dy per dragged id while a translate gesture is in flight. */
  offsets: Record<string, [number, number]>;
  /**
   * Live target rect per resized id while a resize gesture is in flight.
   * Empty when no resize is active. Symmetric to {@link offsets}; lets
   * size-meter / measurement extras read W × H without double-baking.
   */
  resizes: Record<
    string,
    { x: number; y: number; width: number; height: number }
  >;
}) => HUDDraw | undefined;

export interface HUDStageProps {
  fixture: Fixture;
  /** Override the fixture's default selection. */
  selection?: string[];
  /**
   * Pre-grouped multi-selection. When provided, takes precedence over
   * `selection`. Each group carries its own ids and union shape; matches the
   * `SelectionGroup[]` shape svg-editor passes for multi-select.
   */
  selectionGroups?: SelectionGroup[];
  /** Host-driven hover (e.g. layer-panel mouseenter). null clears. */
  hoverOverride?: NodeId | null;
  /** Render rotation handles (defaults true). */
  showRotationHandles?: boolean;
  /** Enable the back-most pixel-grid layer (visible when zoom >= 4). */
  pixelGrid?: boolean;
  /**
   * Enable the back-most ruler chrome (L-shape: top + left strip). Pass
   * `true` for the default config or a partial `RulerConfig` to override
   * tokens (color, strip width, marks, ranges, etc.). Camera transform is
   * threaded automatically; do not set `transform` here.
   */
  ruler?: boolean | Omit<RulerConfig, "enabled" | "transform">;
  /**
   * Enable hud's built-in corner-radius chrome. The host owns the radii
   * (and re-pushes a fresh input whenever they change); the hud paints
   * the handles and emits `corner_radius` / `corner_radius_explicit` /
   * `corner_radius_uniform` intents on drag. Forward those to the host
   * via {@link onCornerRadius} — the host applies them, mutates its
   * radii state, and the loop closes when the next render passes a
   * new `cornerRadius` input.
   *
   * Accepts either a single input (one node) or an array (multiple
   * nodes edited at once — used by §15 to show axis-aligned and
   * rotated rects in the same canvas). Each input's chrome is
   * independent; intents carry their own `node_id`.
   */
  cornerRadius?: CornerRadiusInput | readonly CornerRadiusInput[] | null;
  /**
   * Receive corner-radius intents emitted by the hud. The HUDStage does
   * not interpret them — the section owns the rect/line geometry and the
   * "all vs one" policy. Fires for the three kinds
   * (`corner_radius`, `corner_radius_explicit`, `corner_radius_uniform`)
   * and forwards `phase: "preview" | "commit"` unchanged.
   */
  onCornerRadius?: (intent: Intent) => void;
  /**
   * Enable hud's universal parametric-handle chrome. The host owns the
   * scalar values (per handle); the hud paints knobs along the
   * declared curves and emits `parametric_handle` intents on drag.
   * Forward those via {@link onParametricHandle}; on apply, the host
   * pushes back updated values on the next render.
   *
   * Single input or array. Used by §15's star demo to wire three
   * handles (tip-radius coincident group, inner/outer ratio, point-
   * count stepped arc) under one shape.
   */
  parametricHandles?:
    | import("@grida/hud").ParametricHandleInput
    | readonly import("@grida/hud").ParametricHandleInput[]
    | null;
  /**
   * Receive parametric-handle intents. The HUDStage does not
   * interpret them — modifier policy (alt → explicit, etc.) lives in
   * the section's reducer per `/sdk-design`.
   */
  onParametricHandle?: (intent: Intent) => void;
  /**
   * Enable hud's Layer B padding overlay — diagonal-stripe inset side
   * rects + mid-edge drag handles on a flex-parent container. The
   * host owns the padding values; the hud emits `padding_handle`
   * intents on drag (preview-stream + commit). Forward via
   * {@link onPaddingHandle}; on apply, push back the updated input.
   *
   * Pass `null` (or omit) to disable. Schema-level feature flag —
   * absence is the off-state.
   */
  paddingOverlay?: import("@grida/hud").PaddingOverlayInput | null;
  /**
   * Receive `padding_handle` intents emitted by the hud. The HUDStage
   * does not interpret — the section's reducer applies the value to
   * its `padding` state (and to the opposite side when `mirror` is
   * true), and pushes back the updated `paddingOverlay` input.
   */
  onPaddingHandle?: (intent: Intent) => void;
  /**
   * Transform-box (Layer B) — push the bound transform + size + origin
   * + optional container rotation. Hud paints the quad outline,
   * intercepts handles (corner = rotate, side = scale, body =
   * translate), and emits `transform_box` intents on drag. Forward via
   * {@link onTransformBox}; on apply, push back the updated input.
   *
   * Pass `null` (or omit) to disable. Schema-level feature flag —
   * absence is the off-state.
   */
  transformBox?: import("@grida/hud").TransformBoxInput | null;
  /**
   * Receive `transform_box` intents from the hud. The HUDStage does not
   * interpret — the section's reducer commits `intent.transform` to its
   * bound state and pushes back the updated input.
   */
  onTransformBox?: (intent: Intent) => void;
  /** Block all mutating intents. */
  readonly?: boolean;
  /**
   * Lock the host so only host-routed handle intents are honored —
   * every intent kind in {@link FREE_GESTURE_INTENTS} (`select` /
   * `deselect_all` / `translate` / `resize` / `rotate` /
   * `marquee_select` / `lasso_select` / `set_endpoint`) is dropped.
   * Selection chrome stays pinned and the scene becomes a fixed stage
   * for whichever affordance the section wired up (corner-radius,
   * parametric handles, etc.). Used by §15 and the parametric-star
   * demo so the reader can focus on the active handle without
   * accidentally moving or reselecting demo nodes.
   */
  interactionLocked?: boolean;
  /** Decoration layered on top of the hud surface chrome. */
  extra?: HUDExtraBuilder;
  /** Vector content-edit overlay — pass `null` to exit content-edit. */
  vectorEdit?: {
    id: string;
    selection?: {
      vertices: number[];
      segments?: number[];
      tangents?: Array<[number, 0 | 1]>;
      regions?: number[];
    };
  } | null;
  /** Surface vector insertion / selection / bend mode toggles. */
  vectorInsertionMode?: "midpoint" | "projected";
  vectorSelectionMode?: "marquee" | "lasso";
  vectorBendMode?: "auto" | "always";
  /** Style token overrides (chrome color, handle size, etc.). */
  style?: Partial<HUDStyle>;
  /** Color override that wins over `style.chromeColor` per draw. */
  color?: string | null;
  /** Semantic group tagging for hud chrome. Required to use visibility. */
  groups?: SurfaceChromeGroups;
  /** Visibility policy callback — host can hide groups per-gesture. */
  visibility?: SurfaceVisibilityPolicy;
  /** Wire the rotation-aware default cursor renderer. */
  rotationAwareCursors?: boolean;
  /** Initial camera transform (one-shot on mount). */
  initialTransform?: cmath.Transform;
  /** Notified when gesture / hover / cursor / selection changes. */
  onState?: (state: HUDPlaygroundState) => void;
  className?: string;
  /**
   * Optional content rendered BEHIND the hud canvas but in front of
   * (or replacing) the SVG fixture underlay. Used by §15's star demo
   * to paint a custom `<canvas>` with a parametric shape; the demo
   * subscribes to {@link HUDStageProps.onState} for camera/size so
   * its paint stays in sync.
   */
  underlay?: React.ReactNode;
  /** Floating UI rendered above the canvas (toolbars, badges). */
  children?: React.ReactNode;
}

// ───────────────────────────────────────────────────────────────────────────
// Internal: hit-test against the fixture in doc-space.
// Last-wins so the top-most node in the fixture array claims clicks.
// ───────────────────────────────────────────────────────────────────────────

function hitPick(fixture: Fixture, point: [number, number]): NodeId | null {
  const [px, py] = point;
  for (let i = fixture.nodes.length - 1; i >= 0; i--) {
    const n = fixture.nodes[i];
    if (n.rect) {
      const { x, y, width, height } = n.rect;
      if (n.kind === "rect-rotated" && n.angle !== undefined) {
        const cx = x + width / 2;
        const cy = y + height / 2;
        const c = Math.cos(-n.angle);
        const s = Math.sin(-n.angle);
        const lx = c * (px - cx) - s * (py - cy) + width / 2;
        const ly = s * (px - cx) + c * (py - cy) + height / 2;
        if (lx >= 0 && lx <= width && ly >= 0 && ly <= height) return n.id;
        continue;
      }
      if (px >= x && px <= x + width && py >= y && py <= y + height)
        return n.id;
    }
    if (n.kind === "line" && n.p1 && n.p2) {
      const d = cmath.segment.point_distance([px, py], n.p1, n.p2);
      if (d < 8) return n.id;
    }
    if (n.kind === "polygon" && n.polygon && n.polygon.length >= 3) {
      if (cmath.polygon.pointInPolygon([px, py], n.polygon)) return n.id;
    }
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// SVG underlay
// ───────────────────────────────────────────────────────────────────────────

function FixtureSvg({
  fixture,
  offsets,
  endpointPreviews,
  resizes,
  width,
  height,
  transform,
}: {
  fixture: Fixture;
  offsets: Record<string, [number, number]>;
  endpointPreviews: Record<
    string,
    { p1?: [number, number]; p2?: [number, number] }
  >;
  resizes: Record<
    string,
    { x: number; y: number; width: number; height: number }
  >;
  width: number;
  height: number;
  transform: cmath.Transform;
}) {
  const t = `matrix(${transform[0][0]} ${transform[1][0]} ${transform[0][1]} ${transform[1][1]} ${transform[0][2]} ${transform[1][2]})`;
  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      role="img"
      aria-label="hud demo scene"
    >
      <g transform={t}>
        {fixture.nodes.map((n) => (
          <FixtureShape
            key={n.id}
            node={applyOffsetToNode(n, offsets, endpointPreviews, resizes)}
          />
        ))}
      </g>
    </svg>
  );
}

function FixtureShape({ node: n }: { node: FixtureNode }) {
  if (n.kind === "line" && n.p1 && n.p2) {
    return (
      <line
        x1={n.p1[0]}
        y1={n.p1[1]}
        x2={n.p2[0]}
        y2={n.p2[1]}
        stroke={n.stroke ?? "#475569"}
        strokeWidth={2}
        strokeLinecap="round"
      />
    );
  }
  if (n.kind === "vector" && n.vector) {
    return <VectorShape vector={n.vector} stroke={n.stroke ?? "#475569"} />;
  }
  // Polygon — used by §15's star demo. Hud only reads the AABB
  // (`fixtureToShape`); the polygon's vertices live in the fixture
  // and the SVG underlay paints them.
  if (n.kind === "polygon" && n.polygon && n.polygon.length >= 3) {
    return (
      <polygon
        points={n.polygon.map((p) => `${p[0]},${p[1]}`).join(" ")}
        fill={n.fill ?? "#E5E7EB"}
        stroke={n.stroke ?? "#94A3B8"}
        strokeWidth={1}
        strokeLinejoin="round"
      />
    );
  }
  if (!n.rect) return null;
  const { x, y, width, height } = n.rect;
  if (n.kind === "rect-rotated" && n.angle !== undefined) {
    const deg = (n.angle * 180) / Math.PI;
    // Per-corner radii on a rotated rect — the §15 third demo. SVG
    // `<rect rx>` is uniform-only, so we fall back to a path when
    // `radius` is an object. The `<g rotate>` wraps everything so
    // the radii are computed in LOCAL space and the rotation is
    // applied to the final SVG element — matches the local→doc
    // matrix the host hands to hud's `setCornerRadius`.
    if (n.radius !== undefined && typeof n.radius === "object") {
      return (
        <g transform={`rotate(${deg} ${x + width / 2} ${y + height / 2})`}>
          <path
            d={roundedRectPath(x, y, width, height, n.radius)}
            fill={n.fill ?? "#E5E7EB"}
            stroke={n.stroke ?? "transparent"}
            strokeWidth={1}
          />
        </g>
      );
    }
    const r =
      n.radius !== undefined && typeof n.radius === "number" ? n.radius : 0;
    return (
      <g transform={`rotate(${deg} ${x + width / 2} ${y + height / 2})`}>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={r}
          ry={r}
          fill={n.fill ?? "#E5E7EB"}
          stroke={n.stroke ?? "transparent"}
          strokeWidth={1}
        />
      </g>
    );
  }
  // Per-corner radii — render via SVG path (SVG `<rect rx>` is uniform-only).
  // Used by §15 to paint the four independent radii the user is dragging.
  if (
    n.kind === "rect-rounded" &&
    n.radius !== undefined &&
    typeof n.radius === "object"
  ) {
    return (
      <path
        d={roundedRectPath(x, y, width, height, n.radius)}
        fill={n.fill ?? "#E5E7EB"}
        stroke={n.stroke ?? "transparent"}
        strokeWidth={1}
      />
    );
  }
  const radius =
    n.kind === "rect-rounded" && typeof n.radius === "number" ? n.radius : 0;
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={radius}
      ry={radius}
      fill={n.fill ?? "#E5E7EB"}
      stroke={n.stroke ?? "transparent"}
      strokeWidth={1}
    />
  );
}

// SVG path for a rect with four independent corner radii. Each corner is
// rounded with a quarter-circle arc; the per-corner radius is clamped to
// half the shorter side so the arcs don't overlap. Matches the geometry
// the legacy `corner-radius-handle.tsx` assumed.
function roundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: { tl: number; tr: number; br: number; bl: number }
): string {
  const cap = Math.min(w, h) / 2;
  const tl = Math.max(0, Math.min(r.tl, cap));
  const tr = Math.max(0, Math.min(r.tr, cap));
  const br = Math.max(0, Math.min(r.br, cap));
  const bl = Math.max(0, Math.min(r.bl, cap));
  return [
    `M ${x + tl} ${y}`,
    `L ${x + w - tr} ${y}`,
    `A ${tr} ${tr} 0 0 1 ${x + w} ${y + tr}`,
    `L ${x + w} ${y + h - br}`,
    `A ${br} ${br} 0 0 1 ${x + w - br} ${y + h}`,
    `L ${x + bl} ${y + h}`,
    `A ${bl} ${bl} 0 0 1 ${x} ${y + h - bl}`,
    `L ${x} ${y + tl}`,
    `A ${tl} ${tl} 0 0 1 ${x + tl} ${y}`,
    "Z",
  ].join(" ");
}

function VectorShape({
  vector,
  stroke,
}: {
  vector: VectorOverlay;
  stroke: string;
}) {
  const [ox, oy] = vector.origin ?? [0, 0];
  const verts = vector.vertices;
  if (verts.length === 0) return null;
  // VectorOverlay control points are absolute doc-space (vertex + offset
  // already applied), per the hud contract.
  let d = `M ${verts[0][0] + ox} ${verts[0][1] + oy}`;
  for (let i = 1; i < verts.length; i++) {
    const seg = vector.segments?.find((s) => s.a === i - 1 && s.b === i);
    const isStraight =
      !seg ||
      (seg.a_control[0] === verts[seg.a][0] &&
        seg.a_control[1] === verts[seg.a][1] &&
        seg.b_control[0] === verts[seg.b][0] &&
        seg.b_control[1] === verts[seg.b][1]);
    if (seg && !isStraight) {
      d += ` C ${seg.a_control[0] + ox} ${seg.a_control[1] + oy} ${seg.b_control[0] + ox} ${seg.b_control[1] + oy} ${verts[i][0] + ox} ${verts[i][1] + oy}`;
    } else {
      d += ` L ${verts[i][0] + ox} ${verts[i][1] + oy}`;
    }
  }
  const closing = vector.segments?.find(
    (s) => s.a === verts.length - 1 && s.b === 0
  );
  if (closing) {
    d += ` C ${closing.a_control[0] + ox} ${closing.a_control[1] + oy} ${closing.b_control[0] + ox} ${closing.b_control[1] + oy} ${verts[0][0] + ox} ${verts[0][1] + oy} Z`;
  }
  return <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} />;
}

// ───────────────────────────────────────────────────────────────────────────
// Camera + event helpers
// ───────────────────────────────────────────────────────────────────────────

// Min/max zoom clamps. Match @grida/svg-editor's wheel-pan-zoom defaults
// (packages/grida-svg-editor/src/gestures/defaults.ts) so this demo feels
// identical to the production host.
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 256;

function applyZoom(
  t: cmath.Transform,
  factor: number,
  pivot: [number, number]
): cmath.Transform {
  const [sx, , tx] = t[0];
  const [, , ty] = t[1];
  const ns = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, sx * factor));
  const k = ns / sx;
  const ntx = pivot[0] - (pivot[0] - tx) * k;
  const nty = pivot[1] - (pivot[1] - ty) * k;
  return [
    [ns, 0, ntx],
    [0, ns, nty],
  ];
}

function modifiersFromEvent(
  e: PointerEvent | WheelEvent | KeyboardEvent
): Modifiers {
  return {
    shift: e.shiftKey,
    alt: e.altKey,
    meta: e.metaKey,
    ctrl: e.ctrlKey,
  };
}

function eventButton(e: PointerEvent): "primary" | "secondary" | "middle" {
  if (e.button === 1) return "middle";
  if (e.button === 2) return "secondary";
  return "primary";
}

// ───────────────────────────────────────────────────────────────────────────
// Translate-preview helper — returns a shallow-cloned node with its
// rect/p1/p2 offset by (dx, dy). Used by `pick`, `shapeOf`, and the SVG
// underlay so the dragged shape, its hit-test, and the selection chrome
// all stay in sync mid-gesture.
// ───────────────────────────────────────────────────────────────────────────

function applyOffsetToNode(
  n: FixtureNode,
  offs: Record<string, [number, number]>,
  endpoints?: Record<string, { p1?: [number, number]; p2?: [number, number] }>,
  resizes?: Record<
    string,
    { x: number; y: number; width: number; height: number }
  >
): FixtureNode {
  const off = offs[n.id];
  const ep = endpoints?.[n.id];
  const rz = resizes?.[n.id];
  if (!off && !ep && !rz) return n;
  let next: FixtureNode = n;
  if (off) {
    const [dx, dy] = off;
    if (next.rect)
      next = {
        ...next,
        rect: { ...next.rect, x: next.rect.x + dx, y: next.rect.y + dy },
      };
    if (next.p1 && next.p2)
      next = {
        ...next,
        p1: [next.p1[0] + dx, next.p1[1] + dy],
        p2: [next.p2[0] + dx, next.p2[1] + dy],
      };
  }
  if (ep && next.p1 && next.p2) {
    next = {
      ...next,
      p1: ep.p1 ?? next.p1,
      p2: ep.p2 ?? next.p2,
    };
  }
  if (rz && next.rect) {
    next = { ...next, rect: { ...next.rect, ...rz } };
  }
  return next;
}

function commitOffsets(
  fixture: Fixture,
  offs: Record<string, [number, number]>,
  endpoints?: Record<string, { p1?: [number, number]; p2?: [number, number] }>,
  resizes?: Record<
    string,
    { x: number; y: number; width: number; height: number }
  >
): Fixture {
  if (
    Object.keys(offs).length === 0 &&
    (!endpoints || Object.keys(endpoints).length === 0) &&
    (!resizes || Object.keys(resizes).length === 0)
  )
    return fixture;
  return {
    ...fixture,
    nodes: fixture.nodes.map((n) =>
      applyOffsetToNode(n, offs, endpoints, resizes)
    ),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// HUDStage
// ───────────────────────────────────────────────────────────────────────────

export function HUDStage(props: HUDStageProps) {
  const {
    fixture,
    selection: selectionProp,
    selectionGroups,
    hoverOverride,
    showRotationHandles = true,
    pixelGrid = false,
    ruler = false,
    cornerRadius = null,
    onCornerRadius,
    parametricHandles = null,
    onParametricHandle,
    paddingOverlay = null,
    onPaddingHandle,
    transformBox = null,
    onTransformBox,
    readonly = false,
    interactionLocked = false,
    extra,
    vectorEdit,
    vectorInsertionMode,
    vectorSelectionMode,
    vectorBendMode,
    style,
    color,
    groups,
    visibility,
    rotationAwareCursors = true,
    initialTransform,
    onState,
    className,
    underlay,
    children,
  } = props;

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // Local selection mirror. Controlled-by-prop on selectionProp change.
  const [selection, setSelection] = React.useState<string[]>(
    () => selectionProp ?? fixture.initialSelection ?? []
  );
  React.useEffect(() => {
    // Truthy check would drop `selection={[]}` (a deliberate "clear");
    // explicit-undefined keeps the field truly optional.
    if (selectionProp !== undefined) setSelection(selectionProp);
  }, [selectionProp]);

  // Live fixture — starts from the prop, mutates on translate commit.
  // We don't bubble mutations back to the parent; the demo treats the
  // initial fixture as a starting layout and accumulates changes here.
  const [liveFixture, setLiveFixture] = React.useState(fixture);
  React.useEffect(() => {
    setLiveFixture(fixture);
  }, [fixture]);

  // Translate preview offsets, applied on top of liveFixture in shapeOf.
  // The dragged ids carry the live dx/dy until the gesture commits, at
  // which point the offset is written into liveFixture and cleared here.
  const [previewOffsets, setPreviewOffsets] = React.useState<
    Record<string, [number, number]>
  >({});
  const previewOffsetsRef = React.useRef(previewOffsets);
  previewOffsetsRef.current = previewOffsets;

  // Line-endpoint preview overrides, applied on top of liveFixture in shapeOf
  // and the SVG underlay. Unlike translate offsets (deltas), endpoint moves
  // are absolute positions — `set_endpoint` carries `pos`, not `dx/dy` —
  // so they live in their own map keyed by node id, partial per endpoint.
  const [endpointPreviews, setEndpointPreviews] = React.useState<
    Record<string, { p1?: [number, number]; p2?: [number, number] }>
  >({});
  const endpointPreviewsRef = React.useRef(endpointPreviews);
  endpointPreviewsRef.current = endpointPreviews;

  // Resize preview rects, applied on top of liveFixture in shapeOf / SVG /
  // extra ctx. Resize intent's `rect` is the group AABB; for the demo's
  // single-rect fixtures we apply it directly to the one resized id. Multi-
  // id groups are out of scope (svg-editor solves that with shape, not rect).
  const [resizePreviews, setResizePreviews] = React.useState<
    Record<string, { x: number; y: number; width: number; height: number }>
  >({});
  const resizePreviewsRef = React.useRef(resizePreviews);
  resizePreviewsRef.current = resizePreviews;

  // Camera. `initialTransform` is read once at mount — runtime changes
  // would fight the user's wheel-zoom, so we don't track it as a dep.
  const [transform, setTransform] = React.useState<cmath.Transform>(
    () => initialTransform ?? cmath.transform.identity
  );

  // Refs — pointer handlers read latest values without re-binding.
  const fixtureRef = React.useRef(liveFixture);
  const selectionRef = React.useRef(selection);
  const transformRef = React.useRef(transform);
  const extraRef = React.useRef(extra);
  const onStateRef = React.useRef(onState);
  const visibilityRef = React.useRef(visibility);
  const onCornerRadiusRef = React.useRef(onCornerRadius);
  const onParametricHandleRef = React.useRef(onParametricHandle);
  onParametricHandleRef.current = onParametricHandle;
  const onPaddingHandleRef = React.useRef(onPaddingHandle);
  onPaddingHandleRef.current = onPaddingHandle;
  const onTransformBoxRef = React.useRef(onTransformBox);
  onTransformBoxRef.current = onTransformBox;
  const interactionLockedRef = React.useRef(interactionLocked);
  interactionLockedRef.current = interactionLocked;
  const lastIntentRef = React.useRef<Intent | null>(null);
  // Local click-tracker — mirror of the surface's canvas-tuned 250 ms / 4-px
  // window (the surface's internal one isn't exposed). Used by the
  // inspector for `clickCount` and by the click-tracker section's badge
  // (via `state.lastClick*`).
  const clickTrackRef = React.useRef({ t: 0, x: 0, y: 0, count: 0 });
  fixtureRef.current = liveFixture;
  selectionRef.current = selection;
  transformRef.current = transform;
  extraRef.current = extra;
  onStateRef.current = onState;
  visibilityRef.current = visibility;
  onCornerRadiusRef.current = onCornerRadius;

  // Declared up here so `computeExtra` (defined next) can read it safely
  // through closure. `surface` is set by the layout effect below; until
  // then the ref holds null and the gesture call returns idle.
  const surfaceRef = React.useRef<Surface | null>(null);

  const computeExtra = React.useCallback((): HUDDraw | undefined => {
    const fn = extraRef.current;
    if (!fn) return undefined;
    return fn({
      selection: selectionRef.current,
      transform: transformRef.current,
      fixture: fixtureRef.current,
      gesture: surfaceRef.current?.gesture() ?? { kind: "idle" },
      offsets: previewOffsetsRef.current,
      resizes: resizePreviewsRef.current,
    });
  }, []);

  // Intent handler — kept stable via ref so the Surface options are built
  // once and never re-bound.
  const handleIntentRef = React.useRef<((intent: Intent) => void) | null>(null);
  handleIntentRef.current = (intent) => {
    lastIntentRef.current = intent;
    // When the host has locked interaction, drop free-gesture intents
    // (selection / marquee / direct node manipulation). The hud still
    // emits everything; the host is the gate. Denylist on purpose —
    // host-routed handle intents (any handle family the section wired
    // up) pass through automatically without having to be enumerated.
    if (interactionLockedRef.current && FREE_GESTURE_INTENTS.has(intent.kind)) {
      return;
    }
    if (intent.kind === "select") {
      setSelection((curr) => {
        const ids = intent.ids as readonly string[];
        if (intent.mode === "replace") return [...ids];
        const set = new Set(curr);
        if (intent.mode === "add") {
          for (const id of ids) set.add(id);
          return Array.from(set);
        }
        for (const id of ids) {
          if (set.has(id)) set.delete(id);
          else set.add(id);
        }
        return Array.from(set);
      });
    } else if (intent.kind === "deselect_all") {
      setSelection([]);
    } else if (intent.kind === "translate") {
      const ids = intent.ids as readonly string[];
      if (intent.phase === "preview") {
        setPreviewOffsets((prev) => {
          let changed = false;
          for (const id of ids) {
            const cur = prev[id];
            if (!cur || cur[0] !== intent.dx || cur[1] !== intent.dy) {
              changed = true;
              break;
            }
          }
          if (!changed) return prev;
          const next: Record<string, [number, number]> = { ...prev };
          for (const id of ids) next[id] = [intent.dx, intent.dy];
          return next;
        });
      } else if (intent.phase === "commit") {
        setLiveFixture((prev) =>
          commitOffsets(
            prev,
            Object.fromEntries(ids.map((id) => [id, [intent.dx, intent.dy]]))
          )
        );
        setPreviewOffsets((prev) => {
          const next = { ...prev };
          for (const id of ids) delete next[id];
          return next;
        });
      }
    } else if (intent.kind === "resize") {
      // Demo applies resize to a single axis-aligned rect node only (the
      // visibility section's fixture). Multi-id groups would need the
      // new AABB distributed across members; rotated nodes carry their
      // true dims as `intent.shape.local` + a matrix, not the doc-space
      // AABB in `intent.rect` — writing the AABB into a `rect-rotated`'s
      // local rect would corrupt its geometry while preserving the angle.
      // Both cases are out of scope for the showcase; bail explicitly.
      const ids = intent.ids as readonly string[];
      if (ids.length !== 1) return;
      const id = ids[0];
      const node = fixtureRef.current.nodes.find((n) => n.id === id);
      if (!node?.rect) return;
      if (node.kind === "rect-rotated") return;
      const next = {
        x: intent.rect.x,
        y: intent.rect.y,
        width: intent.rect.width,
        height: intent.rect.height,
      };
      if (intent.phase === "preview") {
        setResizePreviews((prev) => {
          const cur = prev[id];
          if (
            cur &&
            cur.x === next.x &&
            cur.y === next.y &&
            cur.width === next.width &&
            cur.height === next.height
          )
            return prev;
          return { ...prev, [id]: next };
        });
      } else if (intent.phase === "commit") {
        setLiveFixture((prev) =>
          commitOffsets(prev, {}, undefined, { [id]: next })
        );
        setResizePreviews((prev) => {
          if (!prev[id]) return prev;
          const out = { ...prev };
          delete out[id];
          return out;
        });
      }
    } else if (intent.kind === "set_endpoint") {
      // Line endpoint drag — `pos` is absolute doc-space. Preview keeps it
      // in `endpointPreviews` (consumed by hitPick / shapeOf / SVG); commit
      // bakes it into liveFixture and clears the override. Mirrors the
      // translate handler's preview/commit pairing for offsets.
      const { id, endpoint, pos } = intent;
      if (intent.phase === "preview") {
        setEndpointPreviews((prev) => {
          const cur = prev[id] ?? {};
          const existing = cur[endpoint];
          if (existing && existing[0] === pos[0] && existing[1] === pos[1])
            return prev;
          return {
            ...prev,
            [id]: { ...cur, [endpoint]: [pos[0], pos[1]] as [number, number] },
          };
        });
      } else if (intent.phase === "commit") {
        setLiveFixture((prev) =>
          commitOffsets(prev, {}, { [id]: { [endpoint]: [pos[0], pos[1]] } })
        );
        setEndpointPreviews((prev) => {
          if (!prev[id]) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    } else if (
      intent.kind === "corner_radius" ||
      intent.kind === "corner_radius_explicit" ||
      intent.kind === "corner_radius_uniform"
    ) {
      // Hud owns the gesture; the host owns the radii. Forward the intent
      // to the section, which decides "all vs one" by context (uniform vs
      // non-uniform on the default kind; always-one on the explicit kind;
      // always-uniform on the line kind) and pushes back a new
      // `cornerRadius` input on the next render.
      onCornerRadiusRef.current?.(intent);
    } else if (intent.kind === "parametric_handle") {
      // Universal parametric-handle affordance. The HUDStage doesn't
      // interpret — modifier semantics (alt → explicit anchor, etc.)
      // live in the section's reducer per `/sdk-design`. The section
      // mutates its host-owned scalar values and pushes back updated
      // `parametricHandles` inputs on the next render.
      onParametricHandleRef.current?.(intent);
    } else if (intent.kind === "padding_handle") {
      // Layer B padding model — section owns the per-side values and
      // the active-side mirror. Forwards `padding_handle` (preview /
      // commit) and the `mirror` flag; HUDStage stays unopinionated.
      onPaddingHandleRef.current?.(intent);
    } else if (intent.kind === "transform_box") {
      // Layer B transform-box model — section owns the bound
      // transform. Forwards `transform_box` (preview / commit); the
      // section's reducer commits `intent.transform` to whatever
      // field it bound to (image-paint transform, node-local
      // transform, …). HUDStage stays unopinionated.
      onTransformBoxRef.current?.(intent);
    } else if (intent.kind === "marquee_select" && intent.phase === "commit") {
      // In vector content-edit, marquee targets vertices, not nodes — let
      // the host's section-level intent observer (subscribed to
      // `state.lastIntent`) handle it. Don't clobber the node selection
      // (which is just the path being edited).
      if (vectorEdit) return;
      const r = intent.rect;
      const hits = fixtureRef.current.nodes
        .filter((n) => {
          if (!n.rect) return false;
          const { x, y, width, height } = n.rect;
          return !(
            x + width < r.x ||
            y + height < r.y ||
            x > r.x + r.width ||
            y > r.y + r.height
          );
        })
        .map((n) => n.id);
      setSelection(
        intent.additive
          ? Array.from(new Set([...selectionRef.current, ...hits]))
          : hits
      );
    }
  };

  // Construct Surface directly so we can forward `vectorOf` and the vector
  // mode setters — `useHUDSurface` doesn't currently forward those.
  const [surface, setSurface] = React.useState<Surface | null>(null);
  React.useLayoutEffect(() => {
    if (!canvasRef.current) return;
    // Apply preview offsets so both hit-test and shape resolution follow
    // the in-flight drag.
    const ghosted = (): Fixture =>
      commitOffsets(
        fixtureRef.current,
        previewOffsetsRef.current,
        endpointPreviewsRef.current,
        resizePreviewsRef.current
      );
    const s = new Surface(canvasRef.current, {
      pick: (p) => hitPick(ghosted(), p),
      shapeOf: (id) => {
        const n = ghosted().nodes.find((x) => x.id === id);
        return n ? fixtureToShape(n) : null;
      },
      vectorOf: (id) => {
        const n = fixtureRef.current.nodes.find((x) => x.id === id);
        return n?.vector ?? null;
      },
      groups,
      visibility: visibility
        ? (ctx) => visibilityRef.current?.(ctx)
        : undefined,
      onIntent: (intent) => handleIntentRef.current?.(intent),
    });
    setSurface(s);
    return () => {
      s.dispose();
      setSurface(null);
    };
    // groups / visibility are intentionally read once at construction —
    // changing them at runtime would require a fresh Surface. The visibility
    // callback already reads through visibilityRef so the policy can update
    // without remounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the surface ref in sync so callbacks see the latest instance.
  surfaceRef.current = surface;
  const reportState = React.useCallback(() => {
    const s = surfaceRef.current;
    const fn = onStateRef.current;
    if (!s || !fn) return;
    fn({
      selection: selectionRef.current,
      hover: s.hover(),
      gesture: s.gesture(),
      cursor: s.cursor(),
      lastIntent: lastIntentRef.current,
      modifiers: s.modifiers(),
      transform: transformRef.current,
      zoom: transformRef.current[0][0],
      clickCount: clickTrackRef.current.count,
      lastClickX:
        clickTrackRef.current.t === 0 ? null : clickTrackRef.current.x,
      lastClickY:
        clickTrackRef.current.t === 0 ? null : clickTrackRef.current.y,
      lastClickAt:
        clickTrackRef.current.t === 0 ? null : clickTrackRef.current.t,
    });
  }, []);

  // Default cursor renderer — opt-in via prop.
  React.useEffect(() => {
    if (!surface) return;
    surface.setCursorRenderer(
      rotationAwareCursors ? hud_cursors.defaultRenderer() : null
    );
  }, [surface, rotationAwareCursors]);

  // Pre-grouped selection wins over flat ids.
  React.useEffect(() => {
    if (!surface) return;
    if (selectionGroups) {
      surface.setSelection(selectionGroups);
      surface.draw(computeExtra());
    }
  }, [surface, selectionGroups, computeExtra]);

  // Host-driven hover override (e.g. layer-panel mouseenter).
  React.useEffect(() => {
    if (!surface) return;
    if (hoverOverride !== undefined) surface.setHoverOverride(hoverOverride);
  }, [surface, hoverOverride]);

  // Style + color overrides.
  React.useEffect(() => {
    if (!surface) return;
    if (style) surface.setStyle(style);
    surface.draw(computeExtra());
  }, [surface, style, computeExtra]);

  React.useEffect(() => {
    if (!surface) return;
    if (color !== undefined) surface.setColor(color);
  }, [surface, color]);

  // Selection + style + pixelGrid + readonly toggles → push then redraw.
  // None of these call setState / reportState — they only mutate the
  // surface and trigger a canvas redraw. State observers fire from the
  // pointer-handler path (or from the initial-mount path below).
  // Flat-id selection only when no pre-grouped selection was supplied.
  React.useEffect(() => {
    if (!surface) return;
    if (selectionGroups) return;
    surface.setSelection(selection);
    surface.draw(computeExtra());
  }, [surface, selection, selectionGroups, computeExtra]);

  // Live fixture OR preview offsets changed — re-push selection so the
  // surface re-resolves shapes via shapeOf, then redraw. shapeOf reads
  // through fixtureRef + previewOffsetsRef, but the chrome cache only
  // rebuilds on setSelection / draw.
  React.useEffect(() => {
    if (!surface) return;
    if (selectionGroups) surface.setSelection(selectionGroups);
    else surface.setSelection(selectionRef.current);
    surface.draw(computeExtra());
  }, [
    surface,
    liveFixture,
    previewOffsets,
    endpointPreviews,
    resizePreviews,
    selectionGroups,
    computeExtra,
  ]);

  React.useEffect(() => {
    if (!surface) return;
    surface.setStyle({ showRotationHandles });
    surface.draw(computeExtra());
  }, [surface, showRotationHandles, computeExtra]);

  React.useEffect(() => {
    if (!surface) return;
    surface.setReadonly(readonly);
  }, [surface, readonly]);

  // Ruler chrome — same two-transform contract as pixel-grid. The host
  // owns the camera, so we re-push the transform on every camera change.
  React.useEffect(() => {
    if (!surface) return;
    if (!ruler) {
      surface.setRuler(null);
      surface.draw(computeExtra());
      return;
    }
    const overrides = ruler === true ? {} : ruler;
    surface.setRuler({ enabled: true, transform, ...overrides });
    surface.draw(computeExtra());
  }, [surface, ruler, transform, computeExtra]);

  React.useEffect(() => {
    if (!surface) return;
    surface.setPixelGrid(
      pixelGrid ? { enabled: true, zoomThreshold: 4, transform } : null
    );
    surface.draw(computeExtra());
  }, [surface, pixelGrid, transform, computeExtra]);

  // Corner-radius chrome — pass-through to the hud. The host owns the
  // input (which geometry, which radii) and re-pushes a fresh value
  // whenever its radii state changes (driven by intents the hud emits).
  // Mirrors the `setRuler` / `setPixelGrid` pattern.
  React.useEffect(() => {
    if (!surface) return;
    surface.setCornerRadius(cornerRadius);
    surface.draw(computeExtra());
  }, [surface, cornerRadius, computeExtra]);

  // Parametric-handle chrome — same pass-through pattern. Host owns
  // the values; intent re-flow closes the loop on each change.
  React.useEffect(() => {
    if (!surface) return;
    surface.setParametricHandles(parametricHandles);
    surface.draw(computeExtra());
  }, [surface, parametricHandles, computeExtra]);

  // Padding overlay (Layer B) — host pushes the container rect + per-side
  // values + optional `active_side` mirror; hud paints and emits
  // `padding_handle` intents on drag. Loop closes when the host applies
  // the value and pushes a new `paddingOverlay` input back.
  React.useEffect(() => {
    if (!surface) return;
    surface.setPaddingOverlay(paddingOverlay);
    surface.draw(computeExtra());
  }, [surface, paddingOverlay, computeExtra]);

  // Transform-box (Layer B) — host pushes the bound transform + size +
  // origin + optional rotation. Hud paints the quad outline + handles
  // and emits `transform_box` intents on drag. Loop closes when the
  // host commits `intent.transform` and pushes back a new input.
  React.useEffect(() => {
    if (!surface) return;
    surface.setTransformBox(transformBox);
    surface.draw(computeExtra());
  }, [surface, transformBox, computeExtra]);

  // Host-`extra`-only change → nudge a redraw. `extra` is read through
  // `extraRef.current` at draw time (so per-frame draws always see the
  // latest closure), but hud has no internal reason to redraw when only
  // the host's draw callback changes — no camera delta, no gesture, no
  // selection change. Without this effect, a host toggle that only flips
  // the draw output (e.g. §16's direction chip) wouldn't repaint until
  // the next user interaction. The other redraw effects above already
  // cover their own deps; this one covers the bare `extra` case.
  React.useEffect(() => {
    if (!surface) return;
    surface.draw(computeExtra());
  }, [surface, extra, computeExtra]);

  React.useEffect(() => {
    if (!surface) return;
    if (vectorEdit) {
      surface.setVectorSelection({
        node_id: vectorEdit.id,
        vertices: vectorEdit.selection?.vertices ?? [],
        segments: vectorEdit.selection?.segments ?? [],
        tangents: vectorEdit.selection?.tangents ?? [],
        regions: vectorEdit.selection?.regions ?? [],
      });
    } else {
      surface.setVectorSelection(null);
    }
    surface.draw(computeExtra());
  }, [surface, vectorEdit, computeExtra]);

  React.useEffect(() => {
    if (!surface) return;
    if (vectorInsertionMode)
      surface.setVectorInsertionMode(vectorInsertionMode);
  }, [surface, vectorInsertionMode]);
  React.useEffect(() => {
    if (!surface) return;
    if (vectorSelectionMode)
      surface.setVectorSelectionMode(vectorSelectionMode);
  }, [surface, vectorSelectionMode]);
  React.useEffect(() => {
    if (!surface) return;
    if (vectorBendMode) surface.setVectorBendMode(vectorBendMode);
  }, [surface, vectorBendMode]);

  // Resize observer.
  const [size, setSize] = React.useState({ width: 600, height: 460 });
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      setSize((prev) =>
        prev.width === w && prev.height === h ? prev : { width: w, height: h }
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  React.useEffect(() => {
    if (!surface) return;
    surface.setSize(size.width, size.height);
    surface.setTransform(transform);
    surface.draw(computeExtra());
    // Camera + size are observable host state. Pushing through reportState
    // here is what lets host overlays (e.g. §14's DOM guide lines, which
    // recompute screen positions from `state.transform`) reposition on
    // every wheel-zoom / pan, not only when the pointer happens to move.
    reportState();
  }, [surface, size.width, size.height, transform, computeExtra, reportState]);

  // Initial state push when the surface becomes available.
  React.useEffect(() => {
    if (!surface) return;
    reportState();
  }, [surface, reportState]);

  // ───── Pointer / wheel / key wiring ─────
  React.useEffect(() => {
    if (!surface) return;
    const el = containerRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;

    // ── Listener-target choice ────────────────────────────────────────────
    // Pointer events bind on `canvas`, NOT `el` (the container).
    //
    // The container holds three siblings: the SVG underlay, the canvas,
    // and the `children` overlay. Children sit on top of the canvas in
    // the z-stack but are sibling DOM nodes — events on them physically
    // cannot bubble through the canvas. Binding pointer listeners on
    // `canvas` means an interactive child overlay (e.g. §14's ruler-
    // guide drag strips) can handle pointer events with React synthetic
    // handlers and `e.stopPropagation()` is irrelevant — hud's listener
    // simply isn't in the event path.
    //
    // Binding on the container instead (the prior shape) meant a child's
    // React synthetic `stopPropagation` couldn't outrun the native bubble
    // listener on the container: hud would see a pointerdown the child
    // intended to swallow, start a gesture, then never see the matching
    // pointerup (which the child's window listener stopped) — gestures
    // stuck open, marquee tracking idle hovers.
    //
    // Wheel / contextmenu / keydown stay on the container so they fire
    // even when the pointer is over an interactive child.
    // ─────────────────────────────────────────────────────────────────────

    const rectOf = () => canvas.getBoundingClientRect();
    const localXY = (e: PointerEvent): [number, number] => {
      const r = rectOf();
      return [e.clientX - r.left, e.clientY - r.top];
    };

    let panFrom: { x: number; y: number; tx: number; ty: number } | null = null;
    const startPan = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      panFrom = {
        x: e.clientX,
        y: e.clientY,
        tx: transformRef.current[0][2],
        ty: transformRef.current[1][2],
      };
      const onMove = (ev: PointerEvent) => {
        if (!panFrom) return;
        setTransform((t) => [
          [t[0][0], t[0][1], panFrom!.tx + (ev.clientX - panFrom!.x)],
          [t[1][0], t[1][1], panFrom!.ty + (ev.clientY - panFrom!.y)],
        ]);
      };
      const onUp = () => {
        panFrom = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 1) {
        startPan(e);
        return;
      }
      canvas.setPointerCapture(e.pointerId);
      const [x, y] = localXY(e);
      // Display-only click tracker (mirrors the canvas-tuned 250ms / 4-px
      // window pinned in `click-tracker.test.ts`).
      const now = performance.now();
      const track = clickTrackRef.current;
      const dt = now - track.t;
      const dist2 = (x - track.x) ** 2 + (y - track.y) ** 2;
      if (dt <= 250 && dist2 <= 16 && track.count > 0) {
        track.count += 1;
      } else {
        track.count = 1;
      }
      track.t = now;
      track.x = x;
      track.y = y;
      surface.dispatch({
        kind: "pointer_down",
        x,
        y,
        button: eventButton(e),
        mods: modifiersFromEvent(e),
      } satisfies SurfaceEvent);
      surface.draw(computeExtra());
      reportState();
    };
    const onPointerMove = (e: PointerEvent) => {
      const [x, y] = localXY(e);
      const r = surface.dispatch({
        kind: "pointer_move",
        x,
        y,
        mods: modifiersFromEvent(e),
      });
      // Hot path: skip the repaint and host roundtrip when the surface
      // says nothing changed (idle hover crossing dead space).
      if (r.needsRedraw) surface.draw(computeExtra());
      reportState();
    };
    const onPointerUp = (e: PointerEvent) => {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* */
      }
      const [x, y] = localXY(e);
      surface.dispatch({
        kind: "pointer_up",
        x,
        y,
        button: eventButton(e),
        mods: modifiersFromEvent(e),
      });
      surface.draw(computeExtra());
      reportState();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = rectOf();
      const localX = e.clientX - r.left;
      const localY = e.clientY - r.top;
      // ctrl/meta + wheel = zoom-at-cursor; native trackpad pinch also
      // reports ctrlKey on macOS so this catches both. Sensitivity and
      // formula match @grida/svg-editor's wheel-pan-zoom default exactly:
      //   factor = 1 - deltaY * 0.01
      if (e.ctrlKey || e.metaKey) {
        const factor = 1 - e.deltaY * 0.01;
        setTransform((t) => applyZoom(t, factor, [localX, localY]));
        return;
      }
      // Plain wheel → pan one-for-one with the wheel delta. svg-editor
      // does the same — no inverse-zoom scaling — so the demo feels the
      // same at high zoom as the production host.
      setTransform((t) => [
        [t[0][0], t[0][1], t[0][2] - e.deltaX],
        [t[1][0], t[1][1], t[1][2] - e.deltaY],
      ]);
    };

    const onContext = (e: MouseEvent) => e.preventDefault();
    const onKeyDown = (e: KeyboardEvent) => {
      surface.dispatch({
        kind: "key",
        phase: "down",
        code: e.code,
        mods: modifiersFromEvent(e),
      });
      surface.draw(computeExtra());
      reportState();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onContext);
    el.addEventListener("keydown", onKeyDown);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContext);
      el.removeEventListener("keydown", onKeyDown);
    };
  }, [surface, computeExtra, reportState]);

  const cursorCss = surface?.cursorCss() ?? "default";

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className={[
        "relative h-full w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60",
        className ?? "",
      ].join(" ")}
      style={{ cursor: cursorCss, touchAction: "none" }}
    >
      <FixtureSvg
        fixture={liveFixture}
        offsets={previewOffsets}
        endpointPreviews={endpointPreviews}
        resizes={resizePreviews}
        width={size.width}
        height={size.height}
        transform={transform}
      />
      {underlay}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />
      {children}
    </div>
  );
}
