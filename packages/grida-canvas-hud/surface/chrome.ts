import cmath from "@grida/cmath";
import type {
  HUDDraw,
  HUDPolyline,
  HUDRect,
  HUDScreenRect,
  HUDSemanticGroup,
} from "../primitives/types";
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
import {
  type OverlayElement,
  type HitShape,
  MIN_HIT_SIZE,
} from "../event/overlay";
import {
  computeSelectionControlLayout,
  HUDHitPriority,
  type SelectionControlZone,
} from "../event/selection-controls";
import type { HUDStyle } from "./style";

export interface ChromeInput {
  state: SurfaceState;
  shapeOf: (id: NodeId) => SelectionShape | null;
  style: HUDStyle;
  groups?: SurfaceChromeGroups;
  width: number;
  height: number;
}

export interface SurfaceChromeGroups {
  hover?: HUDSemanticGroup;
  selection?: HUDSemanticGroup;
  selectionControls?: HUDSemanticGroup;
  marquee?: HUDSemanticGroup;
  transformPreview?: HUDSemanticGroup;
}

/**
 * Build the per-frame surface chrome.
 *
 * Returns a pair:
 * - `overlays` — interactable elements (handles, endpoint knobs, rotation
 *   regions). Each pairs a hit shape with an optional render shape.
 * - `decoration` — pure visual `HUDDraw` (selection outlines, hover outline,
 *   marquee, line outlines). Not interactable.
 *
 * Priority is data, not iteration order. Each `OverlayElement` carries its
 * own `priority` (lower wins) and a stable `label`. The `HitRegions`
 * registry resolves overlapping regions by priority, not push order. See
 * `event/selection-controls.ts` for the canonical priority ladder.
 *
 * The Surface fans `overlays` into `HitRegions` (for events) and merges
 * their render shapes into `decoration` (for the canvas draw call).
 */
export function buildChrome(input: ChromeInput): {
  overlays: OverlayElement[];
  decoration: HUDDraw;
} {
  const { state, shapeOf, style, groups } = input;
  const transform = state.getTransform();
  const overlays: OverlayElement[] = [];
  const decoration_rects: HUDRect[] = [];
  const decoration_lines: HUDDraw["lines"] = [];
  const decoration_polylines: HUDPolyline[] = [];

  // ── Hover outline ───────────────────────────────────────────────────────
  // Effective hover = host override (if any) ?? pointer pick.
  const hover_id =
    state.gesture.kind === "idle" ? state.getEffectiveHover() : null;
  if (hover_id) {
    const shape = shapeOf(hover_id);
    if (shape) {
      pushShapeOutline(
        shape,
        decoration_rects,
        decoration_lines,
        decoration_polylines,
        {
          dashed: false,
          strokeWidth: style.hoverOutlineWidth,
          group: groups?.hover,
        }
      );
    }
  }

  // ── Selection chrome per group ──────────────────────────────────────────
  for (const group of state.getSelectionGroups()) {
    const shape = resolveGroupShape(group, shapeOf);
    if (!shape) continue;

    // Selection outline — always rendered, never interactable.
    pushShapeOutline(
      shape,
      decoration_rects,
      decoration_lines,
      decoration_polylines,
      {
        dashed: false,
        strokeWidth: style.selectionOutlineWidth,
        group: groups?.selection,
      }
    );

    if (shape.kind === "rect") {
      pushRectChrome(
        shape.rect,
        group.ids,
        transform,
        style,
        groups?.selectionControls,
        overlays
      );
    } else if (shape.kind === "transformed") {
      pushTransformedChrome(
        shape.local,
        shape.matrix,
        group.ids,
        transform,
        style,
        groups?.selectionControls,
        overlays
      );
    } else if (shape.kind === "line") {
      // Lines use endpoint knobs + a body translate zone (no resize).
      pushLineBody(
        shape,
        group.ids,
        transform,
        groups?.selectionControls,
        overlays
      );
      pushLineEndpoints(
        group.ids[0],
        shape.p1,
        shape.p2,
        style,
        groups?.selectionControls,
        overlays
      );
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
      group: groups?.marquee,
    });
  }

  // ── Resize gesture preview ─────────────────────────────────────────────
  // For axis-aligned `rect` shapes the preview is a doc-space dashed
  // rect; for `transformed` shapes it's a 4-corner dashed polyline
  // through the local frame's corners projected by `matrix`, so the
  // preview aligns with the rotated/sheared artwork the user is
  // dragging instead of its AABB.
  if (state.gesture.kind === "resize") {
    const shape = state.gesture.current_shape;
    if (shape.kind === "transformed") {
      const corners = cmath.rect
        .toCorners(shape.local)
        .map((p) => cmath.vector2.transform(p, shape.matrix));
      decoration_polylines.push({
        points: [...corners, corners[0]],
        stroke: true,
        fill: false,
        dashed: true,
        group: groups?.transformPreview,
      });
    } else {
      decoration_rects.push({
        ...shapeBounds(shape),
        stroke: true,
        fill: false,
        dashed: true,
        group: groups?.transformPreview,
      });
    }
  }

  return {
    overlays,
    decoration: {
      rects: decoration_rects.length > 0 ? decoration_rects : undefined,
      lines: decoration_lines.length > 0 ? decoration_lines : undefined,
      polylines:
        decoration_polylines.length > 0 ? decoration_polylines : undefined,
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
// Rect chrome — body (translate) + 4 corner knobs + 4 edge strips
//             + 4 rotation regions. The model and priorities live in
//             `event/selection-controls.ts`; this function is a thin
//             consumer that maps each zone to one OverlayElement.
// ────────────────────────────────────────────────────────────────────────────

function pushRectChrome(
  rect_doc: Rect,
  ids: readonly NodeId[],
  transform: cmath.Transform,
  style: HUDStyle,
  group: HUDSemanticGroup | undefined,
  out: OverlayElement[]
): void {
  const rect_screen = cmath.rect.transform(rect_doc, transform);
  const layout = computeSelectionControlLayout(rect_screen, {
    handle_size: style.handleSize,
    // Rotation knobs render for any non-empty selection — the gesture
    // rotates the union bbox around its center. Previously gated to
    // single-selection only; lifted now that the editor's RotateOrchestrator
    // handles multi-member rotation.
    show_rotation: style.showRotationHandles && ids.length >= 1,
  });

  for (const zone of layout.zones) {
    const el = zoneToOverlay(
      zone,
      rect_doc,
      ids,
      style,
      group,
      layout.controls_visible
    );
    if (el) out.push(el);
  }
}

function zoneToOverlay(
  zone: SelectionControlZone,
  rect_doc: Rect,
  ids: readonly NodeId[],
  style: HUDStyle,
  group: HUDSemanticGroup | undefined,
  controls_visible: boolean
): OverlayElement | null {
  switch (zone.role.kind) {
    case "translate":
      return {
        label: zone.label,
        group,
        action: { kind: "translate_handle", ids },
        hit: { kind: "screen_aabb", rect: zone.rect },
        priority: zone.priority,
        cursor: "move",
      };

    case "resize_corner": {
      const dir = zone.role.direction;
      const size = style.handleSize;
      // Render the visual knob anchored to the doc-space corner so the knob
      // tracks the artwork as the camera moves. The zone.rect is the (screen-
      // space) hit region; the render shape is the smaller visible knob.
      const anchor_doc = cmath.rect.getCardinalPoint(rect_doc, dir);
      return {
        label: zone.label,
        group,
        action: {
          kind: "resize_handle",
          direction: dir,
          ids,
          initial_shape: { kind: "rect", rect: rect_doc },
        },
        hit: { kind: "screen_aabb", rect: zone.rect },
        render: controls_visible
          ? {
              kind: "screen_rect",
              anchor_doc,
              width: size,
              height: size,
              placement: "center",
              fill: true,
              stroke: true,
              fillColor: style.handleFill,
              strokeColor: style.handleStroke,
            }
          : undefined,
        priority: zone.priority,
        cursor: { kind: "resize", direction: dir },
      };
    }

    case "resize_edge":
      return {
        label: zone.label,
        group,
        action: {
          kind: "resize_handle",
          direction: zone.role.direction,
          ids,
          initial_shape: { kind: "rect", rect: rect_doc },
        },
        hit: { kind: "screen_aabb", rect: zone.rect },
        priority: zone.priority,
        cursor: { kind: "resize", direction: zone.role.direction },
      };

    case "rotate":
      return {
        label: zone.label,
        group,
        action: {
          kind: "rotate_handle",
          corner: zone.role.corner,
          ids,
          initial_shape: { kind: "rect", rect: rect_doc },
        },
        hit: { kind: "screen_aabb", rect: zone.rect },
        priority: zone.priority,
        cursor: { kind: "rotate", corner: zone.role.corner },
      };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Transformed chrome — same 9-slice layout as rect chrome, but the input
// rect lives in a local frame mapped to doc-space by an affine matrix.
//
// Strategy: run the 9-slice layout in screen-px space against an axis-
// aligned "shadow" rect centered on the local rect's screen-projected
// center, with dims = local dims × camera×matrix scale. Then ROTATE each
// emitted zone around that screen center by the screen-space rotation
// angle of the local→screen composition.
//
// Hit shape: AABB of the rotated zone corners (conservative-correct).
// Knob render: anchored at the local cardinal point, projected through
// `matrix` to doc-space, with `angle` set to the screen rotation so the
// visible knob square rotates together with the selection.
// ────────────────────────────────────────────────────────────────────────────

function pushTransformedChrome(
  local: Rect,
  matrix: cmath.Transform,
  ids: readonly NodeId[],
  camera: cmath.Transform,
  style: HUDStyle,
  group: HUDSemanticGroup | undefined,
  out: OverlayElement[]
): void {
  const local_to_screen = cmath.transform.multiply(camera, matrix);

  // Decompose. `getScale` returns the per-axis magnitude of the matrix
  // columns; `angle` returns degrees (we want radians for ctx.rotate and
  // for `HUDScreenRect.angle`).
  const scale_xy = cmath.transform.getScale(local_to_screen);
  const angle_deg = cmath.transform.angle(local_to_screen);
  const angle_rad = (angle_deg * Math.PI) / 180;

  // Local rect dims projected to screen (the rotated edges' on-screen
  // length). Drives the 9-slice negotiation in screen-px so handle
  // sizes / edge minimums match what the rect path produces.
  const screen_w = local.width * scale_xy[0];
  const screen_h = local.height * scale_xy[1];

  // Screen-space center of the rotated rect — rotation pivot for the
  // emitted zones.
  const local_center: cmath.Vector2 = [
    local.x + local.width / 2,
    local.y + local.height / 2,
  ];
  const screen_center = cmath.vector2.transform(local_center, local_to_screen);

  // Shadow rect: axis-aligned in screen-space, dims match the rotated
  // rect's on-screen edge length. The 9-slice runs against this.
  const shadow_rect: Rect = {
    x: screen_center[0] - screen_w / 2,
    y: screen_center[1] - screen_h / 2,
    width: screen_w,
    height: screen_h,
  };

  const layout = computeSelectionControlLayout(shadow_rect, {
    handle_size: style.handleSize,
    show_rotation: style.showRotationHandles && ids.length >= 1,
  });

  // Inverse-rotation around `screen_center`: maps a screen-space pointer
  // INTO shadow space so AABB containment against `zone.rect` is exact.
  // Stored once per chrome group and shared by every zone's HitShape —
  // cheap pointer transform at hit-test time, no AABB inflation.
  const inverse_transform = cmath.transform.rotate(
    cmath.transform.identity,
    -angle_deg,
    screen_center
  );

  // Initial shape snapshot for resize/rotate actions — the chrome's
  // single source of truth for "what does this gesture act on?" Read
  // by `applyResize` to run resize math in the local frame, and by
  // the rotate-pivot computation in `state.ts` (via `shapeBounds`).
  const initial_shape: SelectionShape = { kind: "transformed", local, matrix };

  for (const zone of layout.zones) {
    const hit: HitShape = {
      kind: "screen_obb",
      rect: zone.rect,
      inverse_transform,
    };

    switch (zone.role.kind) {
      case "translate":
        out.push({
          label: zone.label,
          group,
          action: { kind: "translate_handle", ids },
          hit,
          priority: zone.priority,
          cursor: "move",
        });
        break;

      case "resize_corner": {
        const dir = zone.role.direction;
        const size = style.handleSize;
        const cardinal_local = cmath.rect.getCardinalPoint(local, dir);
        const anchor_doc = cmath.vector2.transform(cardinal_local, matrix);
        out.push({
          label: zone.label,
          group,
          action: {
            kind: "resize_handle",
            direction: dir,
            ids,
            initial_shape,
          },
          hit,
          render: layout.controls_visible
            ? {
                kind: "screen_rect",
                anchor_doc,
                width: size,
                height: size,
                placement: "center",
                fill: true,
                stroke: true,
                fillColor: style.handleFill,
                strokeColor: style.handleStroke,
                angle: angle_rad,
              }
            : undefined,
          priority: zone.priority,
          cursor: { kind: "resize", direction: dir },
        });
        break;
      }

      case "resize_edge":
        out.push({
          label: zone.label,
          group,
          action: {
            kind: "resize_handle",
            direction: zone.role.direction,
            ids,
            initial_shape,
          },
          hit,
          priority: zone.priority,
          cursor: { kind: "resize", direction: zone.role.direction },
        });
        break;

      case "rotate":
        out.push({
          label: zone.label,
          group,
          action: {
            kind: "rotate_handle",
            corner: zone.role.corner,
            ids,
            initial_shape,
          },
          hit,
          priority: zone.priority,
          cursor: { kind: "rotate", corner: zone.role.corner },
        });
        break;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Line chrome — body (translate) + 2 endpoint knobs
// ────────────────────────────────────────────────────────────────────────────

function pushLineBody(
  shape: Extract<SelectionShape, { kind: "line" }>,
  ids: readonly NodeId[],
  transform: cmath.Transform,
  group: HUDSemanticGroup | undefined,
  out: OverlayElement[]
): void {
  const bounds_doc = shapeBounds(shape);
  const rect_screen = cmath.rect.transform(bounds_doc, transform);
  if (rect_screen.width < 1 && rect_screen.height < 1) return;
  out.push({
    label: "translate",
    group,
    action: { kind: "translate_handle", ids },
    hit: { kind: "screen_aabb", rect: rect_screen },
    priority: HUDHitPriority.TRANSLATE_BODY,
    cursor: "move",
  });
}

function pushLineEndpoints(
  id: NodeId,
  p1: cmath.Vector2,
  p2: cmath.Vector2,
  style: HUDStyle,
  group: HUDSemanticGroup | undefined,
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
      label: `endpoint:${ep.which}`,
      group,
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
      priority: HUDHitPriority.ENDPOINT_HANDLE,
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
  polylines: HUDPolyline[],
  opts: { dashed: boolean; strokeWidth?: number; group?: HUDRect["group"] }
): void {
  if (shape.kind === "rect") {
    rects.push({
      ...shape.rect,
      stroke: true,
      fill: false,
      dashed: opts.dashed,
      strokeWidth: opts.strokeWidth,
      group: opts.group,
    });
  } else if (shape.kind === "transformed") {
    // Outline of a transformed shape is the local-frame rect's 4 corners
    // projected through `matrix` to doc-space, drawn as a closed polyline.
    const corners_local = cmath.rect.toCorners(shape.local);
    const corners_doc = corners_local.map((p) =>
      cmath.vector2.transform(p, shape.matrix)
    );
    polylines.push({
      points: [...corners_doc, corners_doc[0]],
      stroke: true,
      fill: false,
      dashed: opts.dashed,
      group: opts.group,
    });
  } else if (shape.kind === "line") {
    lines.push({
      x1: shape.p1[0],
      y1: shape.p1[1],
      x2: shape.p2[0],
      y2: shape.p2[1],
      dashed: opts.dashed,
      strokeWidth: opts.strokeWidth,
      group: opts.group,
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
 *
 * Priority and label are forwarded verbatim from each overlay element to
 * the registered HitRegion — the registry resolves overlaps by priority.
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
    const projected = projectHit(el.hit, transform);
    regions.push({
      rect: projected.rect,
      inverse_transform: projected.inverse_transform,
      action: el.action,
      priority: el.priority,
      label: el.label,
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
        angle: el.render.angle,
        group: el.group,
      });
    }
    // doc_rect / doc_line are not currently emitted via overlays; the chrome
    // builder pushes those into the decoration `HUDDraw` directly. If a
    // future feature needs them as interactable elements, add fan logic
    // here.
  }

  return { screenRects };
}

function projectHit(
  hit: HitShape,
  transform: cmath.Transform
): { rect: Rect; inverse_transform?: cmath.Transform } {
  if (hit.kind === "screen_aabb") return { rect: hit.rect };
  if (hit.kind === "screen_obb")
    return { rect: hit.rect, inverse_transform: hit.inverse_transform };
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
  return { rect: { x, y, width: hit.width, height: hit.height } };
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
