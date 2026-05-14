import cmath from "@grida/cmath";
import type { HUDDraw, HUDRect, HUDScreenRect } from "../primitives/types";
import type { SurfaceState } from "../event/state";
import {
  type SelectionShape,
  type SelectionGroup,
  shapeBounds,
} from "../event/shape";
import { HitRegions } from "../event/hit-regions";
import { docToScreen } from "../event/transform";
import type { NodeId, Rect } from "../event/gesture";
import { rectFromPoints } from "../event/gesture";
import type { ResizeDirection, RotationCorner } from "../event/cursor";
import {
  type OverlayElement,
  type HitShape,
  MIN_HIT_SIZE,
  MIN_CHROME_VISIBLE_SIZE,
  ROTATION_OFFSET,
} from "../event/overlay";
import type { HUDStyle } from "./style";

export interface ChromeInput {
  state: SurfaceState;
  shapeOf: (id: NodeId) => SelectionShape | null;
  style: HUDStyle;
  width: number;
  height: number;
}

const CORNER_RESIZE_DIRECTIONS: ResizeDirection[] = ["nw", "ne", "se", "sw"];
const EDGE_RESIZE_DIRECTIONS: ResizeDirection[] = ["n", "e", "s", "w"];
const ROTATION_CORNERS: RotationCorner[] = ["nw", "ne", "se", "sw"];

/**
 * Build the per-frame surface chrome.
 *
 * Returns a pair:
 * - `overlays` — interactable elements (handles, endpoint knobs, rotation
 *   regions). Each pairs a hit shape with an optional render shape.
 * - `decoration` — pure visual `HUDDraw` (selection outlines, hover outline,
 *   marquee, line outlines). Not interactable.
 *
 * The Surface fans `overlays` into `HitRegions` (for events) and merges
 * their render shapes into `decoration` (for the canvas draw call).
 */
export function buildChrome(input: ChromeInput): {
  overlays: OverlayElement[];
  decoration: HUDDraw;
} {
  const { state, shapeOf, style } = input;
  const transform = state.getTransform();
  const overlays: OverlayElement[] = [];
  const decoration_rects: HUDRect[] = [];
  const decoration_lines: HUDDraw["lines"] = [];

  // While a gesture is in flight, suppress selection chrome and hover
  // outlines so the user sees raw content under the pointer. The
  // gesture-specific overlays below (marquee rect, resize preview) still
  // render, since those ARE the gesture's visualization.
  const in_gesture = state.gesture.kind !== "idle";

  // ── Hover outline ───────────────────────────────────────────────────────
  // Effective hover = host override (if any) ?? pointer pick.
  const hover_id = in_gesture ? null : state.getEffectiveHover();
  if (hover_id) {
    const shape = shapeOf(hover_id);
    if (shape) {
      pushShapeOutline(shape, decoration_rects, decoration_lines, {
        dashed: false,
        strokeWidth: style.hoverOutlineWidth,
      });
    }
  }

  // ── Selection chrome per group ──────────────────────────────────────────
  if (!in_gesture)
    for (const group of state.getSelectionGroups()) {
      const shape = resolveGroupShape(group, shapeOf);
      if (!shape) continue;

      // Selection outline — always rendered, never interactable.
      pushShapeOutline(shape, decoration_rects, decoration_lines, {
        dashed: false,
        strokeWidth: style.selectionOutlineWidth,
      });

      // Body region — covers the group's bbox so any pointer-down inside the
      // chrome starts a translate, even on transparent regions of the content
      // (e.g. corners of a circle's bbox). Pushed FIRST so the corner / edge /
      // rotation regions added below sit on top and win via reverse iteration.
      pushBodyHandle(shape, group.ids, transform, overlays);

      if (shape.kind === "rect") {
        pushRectGroupHandles(shape.rect, group.ids, transform, style, overlays);
      } else if (shape.kind === "line") {
        pushLineEndpoints(group.ids[0], shape.p1, shape.p2, style, overlays);
      }
    }

  // ── Marquee (gesture-driven) ────────────────────────────────────────────
  if (state.gesture.kind === "marquee") {
    const g = state.gesture;
    const mr = rectFromPoints(g.anchor_doc, g.current_doc);
    decoration_rects.push({
      ...mr,
      stroke: true,
      fill: true,
      fillOpacity: 0.15,
    });
  }

  // ── Resize gesture preview rect ─────────────────────────────────────────
  if (state.gesture.kind === "resize") {
    decoration_rects.push({
      ...state.gesture.current_rect,
      stroke: true,
      fill: false,
      dashed: true,
    });
  }

  return {
    overlays,
    decoration: {
      rects: decoration_rects.length > 0 ? decoration_rects : undefined,
      lines: decoration_lines.length > 0 ? decoration_lines : undefined,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Group / shape resolution
// ────────────────────────────────────────────────────────────────────────────

function resolveGroupShape(
  group: SelectionGroup,
  shapeOf: (id: NodeId) => SelectionShape | null
): SelectionShape | null {
  if (group.shape.kind === "unresolved") return shapeOf(group.shape.id);
  return group.shape;
}

// ────────────────────────────────────────────────────────────────────────────
// Body — translate handle covering the selection bbox
// ────────────────────────────────────────────────────────────────────────────

function pushBodyHandle(
  shape: SelectionShape,
  ids: readonly NodeId[],
  transform: cmath.Transform,
  out: OverlayElement[]
): void {
  const bounds_doc = shapeBounds(shape);
  const rect_screen = cmath.rect.transform(bounds_doc, transform);
  // Skip near-zero bboxes (e.g. degenerate line) — endpoint knobs are the
  // only interactable region in that case.
  if (rect_screen.width < 1 && rect_screen.height < 1) return;
  out.push({
    action: { kind: "translate_handle", ids },
    hit: { kind: "screen_aabb", rect: rect_screen },
    cursor: "move",
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Rect chrome — 4 corner knobs (rendered) + 4 edge strips (virtual)
//             + 4 rotation regions (virtual)
// ────────────────────────────────────────────────────────────────────────────

function pushRectGroupHandles(
  rect_doc: Rect,
  ids: readonly NodeId[],
  transform: cmath.Transform,
  style: HUDStyle,
  out: OverlayElement[]
): void {
  const rect_screen = cmath.rect.transform(rect_doc, transform);
  if (
    rect_screen.width < MIN_CHROME_VISIBLE_SIZE &&
    rect_screen.height < MIN_CHROME_VISIBLE_SIZE
  ) {
    return;
  }

  const size = style.handleSize;
  const hit_size = Math.max(size + 4, MIN_HIT_SIZE);
  const anchors_doc = cornerAnchors(rect_doc);

  // 4 corner knobs — rendered + hit.
  for (const dir of CORNER_RESIZE_DIRECTIONS) {
    const anchor_doc = anchors_doc[dir];
    out.push({
      action: {
        kind: "resize_handle",
        direction: dir,
        ids,
        initial_rect: rect_doc,
      },
      hit: {
        kind: "screen_rect_at_doc",
        anchor_doc,
        width: hit_size,
        height: hit_size,
        placement: "center",
      },
      render: {
        kind: "screen_rect",
        anchor_doc,
        width: size,
        height: size,
        placement: "center",
        fill: true,
        stroke: true,
        fillColor: style.handleFill,
        strokeColor: style.handleStroke,
      },
      cursor: { kind: "resize", direction: dir },
    });
  }

  // 4 edge strips — hit only, virtual.
  const edge_strips = edgeStripsScreen(rect_screen, hit_size);
  for (const dir of EDGE_RESIZE_DIRECTIONS) {
    const strip = edge_strips[dir as "n" | "e" | "s" | "w"];
    out.push({
      action: {
        kind: "resize_handle",
        direction: dir,
        ids,
        initial_rect: rect_doc,
      },
      hit: { kind: "screen_aabb", rect: strip },
      cursor: { kind: "resize", direction: dir },
    });
  }

  // 4 rotation regions — hit only, virtual.
  if (style.showRotationHandles && ids.length === 1) {
    const rot_size = MIN_HIT_SIZE;
    for (const corner of ROTATION_CORNERS) {
      const anchor_doc = anchors_doc[corner];
      // Rotation hit sits OUTSIDE the corner by ROTATION_OFFSET.
      const offset_screen = rotationOffsetScreen(corner);
      // Project anchor_doc to screen, add offset, register screen AABB.
      const [ax, ay] = docToScreen(transform, anchor_doc[0], anchor_doc[1]);
      out.push({
        action: {
          kind: "rotate_handle",
          corner,
          ids,
          initial_rect: rect_doc,
        },
        hit: {
          kind: "screen_aabb",
          rect: {
            x: ax + offset_screen[0] - rot_size / 2,
            y: ay + offset_screen[1] - rot_size / 2,
            width: rot_size,
            height: rot_size,
          },
        },
        cursor: { kind: "rotate", corner },
      });
    }
  }
}

function cornerAnchors(r: Rect): Record<ResizeDirection, cmath.Vector2> {
  return {
    nw: [r.x, r.y],
    n: [r.x + r.width / 2, r.y],
    ne: [r.x + r.width, r.y],
    e: [r.x + r.width, r.y + r.height / 2],
    se: [r.x + r.width, r.y + r.height],
    s: [r.x + r.width / 2, r.y + r.height],
    sw: [r.x, r.y + r.height],
    w: [r.x, r.y + r.height / 2],
  };
}

/**
 * Compute the 4 screen-space AABB strips between corner knobs for virtual
 * edge resize regions. Each strip is `thickness` thick, inset from the
 * corners by half the strip thickness so it doesn't overlap corner hits.
 */
function edgeStripsScreen(
  rect_screen: Rect,
  thickness: number
): Record<"n" | "e" | "s" | "w", Rect> {
  const { x, y, width, height } = rect_screen;
  const inset = thickness / 2;
  const half = thickness / 2;
  return {
    n: {
      x: x + inset,
      y: y - half,
      width: Math.max(0, width - inset * 2),
      height: thickness,
    },
    s: {
      x: x + inset,
      y: y + height - half,
      width: Math.max(0, width - inset * 2),
      height: thickness,
    },
    e: {
      x: x + width - half,
      y: y + inset,
      width: thickness,
      height: Math.max(0, height - inset * 2),
    },
    w: {
      x: x - half,
      y: y + inset,
      width: thickness,
      height: Math.max(0, height - inset * 2),
    },
  };
}

function rotationOffsetScreen(corner: RotationCorner): [number, number] {
  switch (corner) {
    case "nw":
      return [-ROTATION_OFFSET, -ROTATION_OFFSET];
    case "ne":
      return [ROTATION_OFFSET, -ROTATION_OFFSET];
    case "se":
      return [ROTATION_OFFSET, ROTATION_OFFSET];
    case "sw":
      return [-ROTATION_OFFSET, ROTATION_OFFSET];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Line chrome — 2 endpoint knobs
// ────────────────────────────────────────────────────────────────────────────

function pushLineEndpoints(
  id: NodeId,
  p1: cmath.Vector2,
  p2: cmath.Vector2,
  style: HUDStyle,
  out: OverlayElement[]
): void {
  const size = style.handleSize;
  const hit_size = Math.max(size + 4, MIN_HIT_SIZE);
  const endpoints: Array<{ which: "p1" | "p2"; pos: cmath.Vector2 }> = [
    { which: "p1", pos: p1 },
    { which: "p2", pos: p2 },
  ];
  for (const ep of endpoints) {
    out.push({
      action: {
        kind: "endpoint_handle",
        endpoint: ep.which,
        id,
        p1: [p1[0], p1[1]],
        p2: [p2[0], p2[1]],
      },
      hit: {
        kind: "screen_rect_at_doc",
        anchor_doc: ep.pos,
        width: hit_size,
        height: hit_size,
        placement: "center",
      },
      render: {
        kind: "screen_rect",
        anchor_doc: ep.pos,
        width: size,
        height: size,
        placement: "center",
        fill: true,
        stroke: true,
        fillColor: style.handleFill,
        strokeColor: style.handleStroke,
      },
      cursor: "pointer",
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Shape outlines
// ────────────────────────────────────────────────────────────────────────────

function pushShapeOutline(
  shape: SelectionShape,
  rects: HUDRect[],
  lines: NonNullable<HUDDraw["lines"]>,
  opts: { dashed: boolean; strokeWidth?: number }
): void {
  if (shape.kind === "rect") {
    rects.push({
      ...shape.rect,
      stroke: true,
      fill: false,
      dashed: opts.dashed,
      strokeWidth: opts.strokeWidth,
    });
  } else if (shape.kind === "line") {
    lines.push({
      x1: shape.p1[0],
      y1: shape.p1[1],
      x2: shape.p2[0],
      y2: shape.p2[1],
      dashed: opts.dashed,
      strokeWidth: opts.strokeWidth,
    });
  }
  // "unresolved" is internal-only; chrome callers resolve before reaching here.
}

// ────────────────────────────────────────────────────────────────────────────
// Fan — OverlayElement[] → HUDDraw render entries + HitRegions push
// ────────────────────────────────────────────────────────────────────────────

/**
 * Fan a list of `OverlayElement`s into per-primitive render arrays and into
 * the hit-region registry. Returns the additional render primitives that
 * should be merged with the decoration `HUDDraw`.
 */
export function fanOverlays(
  overlays: readonly OverlayElement[],
  transform: cmath.Transform,
  regions: HitRegions
): { screenRects: HUDScreenRect[] } {
  regions.clear();
  const screenRects: HUDScreenRect[] = [];

  for (const el of overlays) {
    // Hit-region: project to a screen AABB and push.
    regions.push({
      rect: projectHitAABB(el.hit, transform),
      action: el.action,
    });

    // Render: fan into the appropriate primitive arrays.
    if (!el.render) continue;
    if (el.render.kind === "screen_rect") {
      screenRects.push({
        x: el.render.anchor_doc[0],
        y: el.render.anchor_doc[1],
        width: el.render.width,
        height: el.render.height,
        anchor: el.render.placement,
        fill: el.render.fill,
        stroke: el.render.stroke,
        fillColor: el.render.fillColor,
        strokeColor: el.render.strokeColor,
      });
    }
    // doc_rect / doc_line are not currently emitted via overlays; the chrome
    // builder pushes those into the decoration `HUDDraw` directly. If a
    // future feature needs them as interactable elements, add fan logic
    // here.
  }

  return { screenRects };
}

function projectHitAABB(hit: HitShape, transform: cmath.Transform): Rect {
  if (hit.kind === "screen_aabb") return hit.rect;
  // screen_rect_at_doc
  const [sx, sy] = docToScreen(transform, hit.anchor_doc[0], hit.anchor_doc[1]);
  const placement = hit.placement ?? "center";
  let x = sx;
  let y = sy;
  switch (placement) {
    case "center":
      x = sx - hit.width / 2;
      y = sy - hit.height / 2;
      break;
    case "tl":
      x = sx;
      y = sy;
      break;
    case "tr":
      x = sx - hit.width;
      y = sy;
      break;
    case "bl":
      x = sx;
      y = sy - hit.height;
      break;
    case "br":
      x = sx - hit.width;
      y = sy - hit.height;
      break;
  }
  return { x, y, width: hit.width, height: hit.height };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Merge a base `HUDDraw` (chrome decoration) with optional host-fed extras
 * and surface-owned interactable screenRects into a single command list.
 */
export function mergeDraws(
  base: HUDDraw,
  extra?: HUDDraw,
  screenRects?: HUDScreenRect[]
): HUDDraw {
  const out: HUDDraw = {
    lines: cat(base.lines, extra?.lines),
    rules: cat(base.rules, extra?.rules),
    points: cat(base.points, extra?.points),
    rects: cat(base.rects, extra?.rects),
    polylines: cat(base.polylines, extra?.polylines),
    screenRects: cat(cat(base.screenRects, extra?.screenRects), screenRects),
  };
  return out;
}

/**
 * Concatenate two optional arrays. Returns the non-empty side directly when
 * the other is empty — no defensive copy on the hot draw path.
 */
function cat<T>(a: T[] | undefined, b: T[] | undefined): T[] | undefined {
  if (!b || b.length === 0) return a;
  if (!a || a.length === 0) return b;
  return [...a, ...b];
}
