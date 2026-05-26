// Vector-path — named-class chrome.
//
// Rendered when `SurfaceState.getVectorSelection()` is non-null AND the host
// provided a `vectorOf` callback that resolves the active path's geometry.
//
// What this builds, by family (per @grida/hud README §"Two backends"):
//
//   1. Segment outlines  — PAIRED. The host's `<path>` is the source of
//                          truth, but its `stroke`/`fill` may not reveal
//                          the segment's edge (`stroke="none"` etc.), so
//                          we paint our own thin chrome-colored stroke on
//                          top of each segment for affordance. The hit
//                          region is N small samples along the curve.
//                          Idle: gray, 1px. Hover: chrome color, 3px @
//                          50% opacity. Selected: chrome color, 3px solid.
//   2. Vertex knobs      — PAIRED. Small circle render, padded square hit.
//   3. Tangent handles   — PAIRED knob (small diamond render — a 45°-
//                          rotated square so it reads as a different
//                          control from circular vertex knobs — padded
//                          square hit) plus DECORATIVE line from vertex
//                          to control point. Only emitted for vertices
//                          in `neighbours`. Selected-tangent line
//                          renders at a thicker width.
//   4. Region bodies     — PAIRED. Closed-loop polygons rasterised from
//                          the segment list; hit-tested via screen-space
//                          point-in-polygon.
//   5. Ghost insertion knob — VIRTUAL preview while hovering a segment;
//                              click commits a `split_segment` intent.
//
// Disagreement-by-design: visible knobs are small (legibility), hit
// regions are padded to MIN_HIT_SIZE (Fitts').
//
// Anti-goals (what this class is NOT):
//
// - **Not a path editor.** The host owns the path data — vertices,
//   segments, regions, the model of "what a curve is." This class draws
//   chrome over a host-supplied `VectorOverlay` POJO and emits intents
//   describing what the user did to it. The host's commit logic decides
//   what to do.
// - **Not a sub-selection store.** Selected vertices / segments / regions
//   are mirrored via `setVectorSelection`; the chrome reads it each frame.
//   No internal selection authority.
// - **Not a constraint solver.** Bend and tangent intents carry resolved
//   geometry; the host's path-edit session decides whether to re-solve
//   smooth joins, project to grids, snap to siblings, etc.
// - **Not multi-path.** One `VectorOverlay` per setter call (the
//   currently-edited path). Multi-path editing isn't a model this
//   class supports.
// - **Not undo-aware.** Intents stream `phase: "preview"`; host owns
//   history.

import cmath from "@grida/cmath";
import type { NodeId } from "../../event/gesture";
import type { OverlayElement, RenderShape } from "../../event/overlay";
import { MIN_HIT_SIZE } from "../../event/overlay";
import { docToScreen, IDENTITY } from "../../event/transform";
import type { HUDSemanticGroup } from "../../primitives/types";
import type { HUDStyle } from "../../surface/style";
import type { VectorChromeInput, VectorChromeOutput } from "./input";
import {
  DECORATIVE_PRIORITY,
  GHOST_HANDLE_PRIORITY,
  REGION_PRIORITY,
  SEGMENT_STRIP_PRIORITY,
  TANGENT_HANDLE_PRIORITY,
  VERTEX_HANDLE_PRIORITY,
} from "./priority";

// VectorOverlay / VectorChromeInput / VectorChromeOutput types live in
// ./input.ts. Priority constants live in ./priority.ts.

/** Per-segment sample count for the visual outline ONLY.
 *
 * 24 is dense enough that the visible polyline reads as a smooth curve.
 * Hit-test no longer samples — see the per-segment customHitTest below,
 * which projects the cursor onto the cubic exactly (mirrors the main
 * editor's `cmath.bezier.project`-based model). */
const SEGMENT_SAMPLES = 24;

/** Per-segment sample count for region polygon flattening. Used both
 *  for the rasterised polygon the region uses to render its fill AND
 *  for the screen-space polygon its `customHitTest` runs
 *  `pointInPolygon` against. Higher than `SEGMENT_SAMPLES` because the
 *  polygon is consumed by hit-test, not just rendered — a coarse
 *  rasterisation would leak clicks near a curved boundary. */
const REGION_SAMPLES = 32;

/** Distance threshold (screen-px) for "the cursor is near this segment."
 *  Applied inside the segment's customHitTest after AABB containment.
 *  MIN_HIT_SIZE / 2 (= 8px) matches Fitts' for a 16px hit target — the
 *  user has to be within 8 screen-px of the visible curve to claim. */
const SEGMENT_HIT_THRESHOLD_PX = MIN_HIT_SIZE / 2;

/** Visual size (screen-px) of the "ghost vertex" rendered at the projected
 *  insertion point while the cursor hovers a segment. Smaller than a real
 *  vertex knob so the user can tell preview from committed. */
const GHOST_VERTEX_SIZE = 6;

function offset_point(
  p: readonly [number, number],
  origin: readonly [number, number]
): [number, number] {
  return [p[0] + origin[0], p[1] + origin[1]];
}

/** Build a `segment_strip` action payload from doc-space cubic control
 *  points. Centralized so every overlay that references the same segment
 *  (outline, hit region, ghost preview) shares an identical action shape. */
function make_segment_action(
  node_id: NodeId,
  segment: number,
  a_idx: number,
  b_idx: number,
  a: readonly [number, number],
  b: readonly [number, number],
  a_control: readonly [number, number],
  b_control: readonly [number, number]
) {
  return {
    kind: "segment_strip" as const,
    node_id,
    segment,
    a_idx,
    b_idx,
    a,
    b,
    a_control,
    b_control,
  };
}

/**
 * Build vector chrome for the path under content-edit.
 *
 * Emits, in this order (later overlays win on equal priority — but priority
 * values are what actually resolves overlap, see ladder above):
 *
 *   1. Per-segment decorative POLYLINE outline (state-driven color+width).
 *   2. Per-segment VIRTUAL hit-strip samples (N per segment).
 *   3. Per-tangent DECORATIVE line + PAIRED knob (only for neighbouring
 *      vertices).
 *   4. Per-vertex PAIRED knob.
 *
 * The ordering means that on a per-frame draw, vertex knobs paint LAST and
 * stay visually on top of segment outlines + tangent lines.
 */
export function buildVectorChrome(
  input: VectorChromeInput
): VectorChromeOutput {
  const {
    vector_selection,
    vector_overlay,
    style,
    vector_hover,
    transform = IDENTITY,
    is_interacting = false,
    group,
  } = input;
  const { node_id } = vector_selection;
  const overlays: OverlayElement[] = [];

  const origin = vector_overlay.origin ?? [0, 0];
  const selected_vertex_set = new Set(vector_selection.vertices);
  const selected_segment_set = new Set(vector_selection.segments);
  const selected_tangent_set = new Set(
    vector_selection.tangents.map((t) => `${t[0]}:${t[1]}`)
  );
  const visual_size = style.handleSize;
  // Tangent knobs render smaller than vertex knobs and as a 45°-rotated square
  // ("diamond") so the user can distinguish tangent handles from vertex
  // endpoints at a glance. Main editor: vertex=8px circle, tangent=6px diamond.
  // We derive the tangent visual size from the host's handleSize (0.75×) so a
  // host that bumps handleSize keeps the same ratio.
  const tangent_visual_size = Math.max(4, Math.round(visual_size * 0.75));
  const hit_size = Math.max(visual_size + 4, MIN_HIT_SIZE);

  // Hover slots — only one of each can be the hovered element at a time.
  const hovered_vertex =
    vector_hover && vector_hover.kind === "vertex" ? vector_hover.index : -1;
  const hovered_tangent_key =
    vector_hover && vector_hover.kind === "tangent"
      ? `${vector_hover.tangent[0]}:${vector_hover.tangent[1]}`
      : null;
  const hovered_segment =
    vector_hover && vector_hover.kind === "segment" ? vector_hover.segment : -1;
  const hovered_region =
    vector_hover && vector_hover.kind === "region" ? vector_hover.region : -1;

  const segments = vector_overlay.segments;
  const regions = vector_overlay.regions;
  const selected_region_set = new Set(vector_selection.regions ?? []);

  // ─── Regions (closed-loop body chrome) ─────────────────────────────────
  //
  // Schema-level feature flag: emitted iff `vector_overlay.regions` is
  // present AND `vector_overlay.segments` is present (regions reference
  // segment indices — without segment data there's nothing to flatten).
  //
  // For each region we emit ONE overlay:
  //
  //   - hit:    screen-space AABB + customHitTest running `pointInPolygon`
  //             against the rasterised screen-space loop polygon.
  //             Mirrors the segment-strip's AABB+refinement model.
  //
  //   - render: doc-space closed `doc_polyline` (the cubic samples for
  //             each segment, concatenated, last point === first). Painted
  //             with `fill: true` + `fillPaint = vectorRegionHoverPaint`
  //             (hover state) or `vectorRegionSelectedPaint` (selected
  //             state). Idle = no fill (render omitted entirely).
  //
  // Priority `REGION_PRIORITY` loses to every specific vector control,
  // wins over the empty-space miss — the body of a closed loop becomes
  // clickable without claiming pixels owned by vertices, tangents,
  // ghost, or segment strips.
  //
  // Painted FIRST so vertex / tangent / segment / ghost chrome render
  // visually on top of the region's hover fill.
  if (regions && segments) {
    for (let ri = 0; ri < regions.length; ri++) {
      const region = regions[ri];
      if (region.segments.length === 0) continue;

      // Rasterise the cubic loop in DOC space (for render) and SCREEN
      // space (for hit-test). Concatenate per-segment samples; the loop's
      // closing edge is implicit (last sample === first by construction
      // when the loop is well-formed; we still write `last = first`
      // explicitly at the end so the polyline closes even on malformed
      // input).
      const loop_doc: [number, number][] = [];
      const loop_screen: cmath.Vector2[] = [];
      // Union of endpoint vertex indices — registered on the action so
      // a drag promotion can seed `translate_vector_selection.additional_vertex_indices`.
      const vertices_in_loop = new Set<number>();
      for (let li = 0; li < region.segments.length; li++) {
        const si = region.segments[li];
        if (si < 0 || si >= segments.length) continue;
        const seg = segments[si];
        const a_doc = offset_point(vector_overlay.vertices[seg.a], origin);
        const b_doc = offset_point(vector_overlay.vertices[seg.b], origin);
        const ta_abs_doc = offset_point(seg.a_control, origin);
        const tb_abs_doc = offset_point(seg.b_control, origin);
        const ta_rel_doc: cmath.Vector2 = [
          ta_abs_doc[0] - a_doc[0],
          ta_abs_doc[1] - a_doc[1],
        ];
        const tb_rel_doc: cmath.Vector2 = [
          tb_abs_doc[0] - b_doc[0],
          tb_abs_doc[1] - b_doc[1],
        ];
        vertices_in_loop.add(seg.a);
        vertices_in_loop.add(seg.b);
        // Sample i = 0..N-1 (exclusive end). The next segment's i = 0
        // duplicates this segment's i = N, so dropping the closing
        // endpoint here avoids duplicate vertices in the polygon —
        // matters for `pointInPolygon` consistency.
        for (let i = 0; i < REGION_SAMPLES; i++) {
          const t = i / REGION_SAMPLES;
          const p = cmath.bezier.evaluate(
            a_doc,
            b_doc,
            ta_rel_doc,
            tb_rel_doc,
            t
          );
          loop_doc.push([p[0], p[1]]);
          const [sx, sy] = docToScreen(transform, p[0], p[1]);
          loop_screen.push([sx, sy]);
        }
      }
      if (loop_doc.length < 3) continue;
      // Explicit closing point — last === first — so the doc_polyline
      // renderer's `closePath()` produces a clean closed shape.
      loop_doc.push([loop_doc[0][0], loop_doc[0][1]]);

      // Screen-space AABB of the rasterised polygon. Padded by 1 px so
      // an exact-boundary hit (the pointInPolygon "onEdge" branch)
      // still passes the AABB containment check upstream.
      const aabb_pad = 1;
      const bbox = cmath.rect.fromPoints(loop_screen);
      const hit_rect = {
        x: bbox.x - aabb_pad,
        y: bbox.y - aabb_pad,
        width: bbox.width + 2 * aabb_pad,
        height: bbox.height + 2 * aabb_pad,
      };

      const is_selected = selected_region_set.has(ri);
      const is_hovered = hovered_region === ri;
      // Hover wins over selected — matches every other vector overlay's
      // precedence (vertex / segment / tangent / ghost knobs).
      const fill_paint = is_hovered
        ? style.vectorRegionHoverPaint
        : is_selected
          ? style.vectorRegionSelectedPaint
          : undefined;

      // Closure captures the screen-space polygon by reference. The
      // chrome is rebuilt every frame so the polygon never goes stale
      // beyond one frame's worth of pan/zoom.
      const polygon_screen = loop_screen;

      overlays.push({
        label: `region:${ri}`,
        group,
        action: {
          kind: "region",
          node_id,
          region: ri,
          segments: region.segments,
          vertices: Array.from(vertices_in_loop),
        },
        hit: { kind: "screen_aabb", rect: hit_rect },
        customHitTest: (screen_point) =>
          cmath.polygon.pointInPolygon(screen_point, polygon_screen),
        render: fill_paint
          ? ({
              kind: "doc_polyline",
              points: loop_doc,
              stroke: false,
              fill: true,
              fillPaint: fill_paint,
            } satisfies Extract<RenderShape, { kind: "doc_polyline" }>)
          : undefined,
        priority: REGION_PRIORITY,
        cursor: "pointer",
      });
    }
  }

  // ─── Segments ───────────────────────────────────────────────────────────
  //
  // For each segment we emit two overlays:
  //
  //   (i)  A decorative POLYLINE outline (flattened cubic, state-driven
  //        stroke). Zero-area hit; render only. Painted first so vertex/
  //        tangent knobs end up visually on top.
  //
  //   (ii) A single PROJECTION-BASED hit region. AABB = the segment's
  //        SCREEN-space bezier bbox; `customHitTest` projects the cursor
  //        onto the cubic in screen-space and accepts only when within
  //        `SEGMENT_HIT_THRESHOLD_PX`. The action carries the segment's
  //        four DOC-space control points; the consumer (`event/state.ts`)
  //        re-projects on demand to get the live `t` (for hover preview
  //        and for split/bend down-time).
  //
  // Single-candidate insertion model: one candidate insertion point per
  // segment per cursor position, computed exactly via `cmath.bezier.project`
  // — NOT pre-sampled.
  if (segments) {
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      const a_doc = offset_point(vector_overlay.vertices[seg.a], origin);
      const b_doc = offset_point(vector_overlay.vertices[seg.b], origin);
      const ta_abs_doc = offset_point(seg.a_control, origin);
      const tb_abs_doc = offset_point(seg.b_control, origin);
      const ta_rel_doc: cmath.Vector2 = [
        ta_abs_doc[0] - a_doc[0],
        ta_abs_doc[1] - a_doc[1],
      ];
      const tb_rel_doc: cmath.Vector2 = [
        tb_abs_doc[0] - b_doc[0],
        tb_abs_doc[1] - b_doc[1],
      ];

      const is_selected = selected_segment_set.has(si);
      const is_hovered = hovered_segment === si;
      const seg_style = segment_render_style(style, is_selected, is_hovered);

      // (i) Decorative outline polyline in doc-space.
      const outline_points: [number, number][] = Array.from({
        length: SEGMENT_SAMPLES + 1,
      });
      for (let i = 0; i <= SEGMENT_SAMPLES; i++) {
        const t = i / SEGMENT_SAMPLES;
        const p = cmath.bezier.evaluate(
          a_doc,
          b_doc,
          ta_rel_doc,
          tb_rel_doc,
          t
        );
        outline_points[i] = [p[0], p[1]];
      }
      overlays.push({
        label: `segment_outline:${si}`,
        group,
        action: make_segment_action(
          node_id,
          si,
          seg.a,
          seg.b,
          a_doc,
          b_doc,
          ta_abs_doc,
          tb_abs_doc
        ),
        // Zero-area hit — render only. Hit detection lives on the
        // projection-based region pushed next.
        hit: {
          kind: "screen_aabb",
          rect: { x: 0, y: 0, width: 0, height: 0 },
        },
        render: {
          kind: "doc_polyline",
          points: outline_points,
          stroke: true,
          fill: false,
          color: seg_style.color,
          strokeWidth: seg_style.width,
          strokeOpacity: seg_style.opacity,
        } satisfies Extract<RenderShape, { kind: "doc_polyline" }>,
        priority: DECORATIVE_PRIORITY,
      });

      // (ii) Projection-based hit region (screen-space curve test).
      //
      // Project the four control points to screen-space. The bezier
      // bbox in screen-space becomes the AABB; customHitTest projects
      // the cursor onto the cubic and tests in screen-px.
      const a_screen = docToScreen(transform, a_doc[0], a_doc[1]);
      const b_screen = docToScreen(transform, b_doc[0], b_doc[1]);
      const ta_abs_screen = docToScreen(
        transform,
        ta_abs_doc[0],
        ta_abs_doc[1]
      );
      const tb_abs_screen = docToScreen(
        transform,
        tb_abs_doc[0],
        tb_abs_doc[1]
      );
      const ta_rel_screen: cmath.Vector2 = [
        ta_abs_screen[0] - a_screen[0],
        ta_abs_screen[1] - a_screen[1],
      ];
      const tb_rel_screen: cmath.Vector2 = [
        tb_abs_screen[0] - b_screen[0],
        tb_abs_screen[1] - b_screen[1],
      ];
      const bbox = cmath.bezier.getBBox({
        a: [a_screen[0], a_screen[1]],
        b: [b_screen[0], b_screen[1]],
        ta: ta_rel_screen,
        tb: tb_rel_screen,
      });
      // Pad by the threshold so points reachable by projection still
      // pass AABB containment.
      const pad = SEGMENT_HIT_THRESHOLD_PX + 1;
      const padded_bbox: cmath.Rectangle = {
        x: bbox.x - pad,
        y: bbox.y - pad,
        width: bbox.width + 2 * pad,
        height: bbox.height + 2 * pad,
      };
      const threshold_sq = SEGMENT_HIT_THRESHOLD_PX * SEGMENT_HIT_THRESHOLD_PX;
      // Closure captures the screen-space cubic so projection runs in
      // the same frame as the cursor. Rebuilt each draw → never stale
      // beyond one frame of pan/zoom.
      const a_screen_v: cmath.Vector2 = [a_screen[0], a_screen[1]];
      const b_screen_v: cmath.Vector2 = [b_screen[0], b_screen[1]];
      overlays.push({
        label: `segment:${si}`,
        group,
        action: make_segment_action(
          node_id,
          si,
          seg.a,
          seg.b,
          a_doc,
          b_doc,
          ta_abs_doc,
          tb_abs_doc
        ),
        hit: { kind: "screen_aabb", rect: padded_bbox },
        customHitTest: (screen_point) => {
          const t = cmath.bezier.project(
            a_screen_v,
            b_screen_v,
            ta_rel_screen,
            tb_rel_screen,
            screen_point
          );
          const p = cmath.bezier.evaluate(
            a_screen_v,
            b_screen_v,
            ta_rel_screen,
            tb_rel_screen,
            t
          );
          const dx = screen_point[0] - p[0];
          const dy = screen_point[1] - p[1];
          return dx * dx + dy * dy <= threshold_sq;
        },
        priority: SEGMENT_STRIP_PRIORITY,
        cursor: "pointer",
      });
    }
  }

  // ─── Ghost insertion knob (PAIRED first-class control) ─────────────────
  //
  // Visible knob (small disc) + dedicated hit region (padded to
  // MIN_HIT_SIZE for Fitts'). Owns priority GHOST_HANDLE_PRIORITY — wins
  // over the segment strip underneath, loses to real vertex knobs.
  //
  // Born of segment hover and lives until segment hover ends. Two hover
  // sources keep it on screen:
  //   - `vector_hover.kind === "segment"` — cursor on segment body, off
  //     the ghost knob. Ghost renders in DEFAULT (idle) state.
  //   - `vector_hover.kind === "ghost"`   — cursor on the ghost knob
  //     itself. Ghost renders in HOVER state; pointer_down dispatches to
  //     `split_segment`.
  //
  // Renders regardless of whether the underlying segment is selected —
  // the user can still insert a vertex on a selected segment. "Selected"
  // is not a render state for the ghost itself; a click commits it into
  // a real vertex which takes over rendering through the regular vertex
  // path.
  //
  // **Preview affordance** — suppressed during interaction
  // (`is_interacting`). The ghost is a "this is where the next hover-
  // initiated action would land" hint; once the user has committed
  // pointer input (pending pointer-down or active gesture), it has no
  // job and would compete with whatever the user is actually doing.
  if (
    !is_interacting &&
    segments &&
    vector_hover &&
    (vector_hover.kind === "segment" || vector_hover.kind === "ghost")
  ) {
    const si = vector_hover.segment;
    if (si >= 0 && si < segments.length) {
      const seg = segments[si];
      const a_doc = offset_point(vector_overlay.vertices[seg.a], origin);
      const b_doc = offset_point(vector_overlay.vertices[seg.b], origin);
      const ta_abs_doc = offset_point(seg.a_control, origin);
      const tb_abs_doc = offset_point(seg.b_control, origin);
      const ta_rel: cmath.Vector2 = [
        ta_abs_doc[0] - a_doc[0],
        ta_abs_doc[1] - a_doc[1],
      ];
      const tb_rel: cmath.Vector2 = [
        tb_abs_doc[0] - b_doc[0],
        tb_abs_doc[1] - b_doc[1],
      ];
      const p = cmath.bezier.evaluate(
        a_doc,
        b_doc,
        ta_rel,
        tb_rel,
        vector_hover.t
      );
      const is_hovered = vector_hover.kind === "ghost";
      overlays.push({
        label: `segment_ghost:${si}`,
        group,
        action: {
          kind: "ghost_handle",
          node_id,
          segment: si,
          a_idx: seg.a,
          b_idx: seg.b,
          a: [a_doc[0], a_doc[1]],
          b: [b_doc[0], b_doc[1]],
          a_control: [ta_abs_doc[0], ta_abs_doc[1]],
          b_control: [tb_abs_doc[0], tb_abs_doc[1]],
        },
        // Padded square hit anchored at the ghost's screen position —
        // Fitts' reach identical to a vertex knob.
        hit: {
          kind: "screen_rect_at_doc",
          anchor_doc: [p[0], p[1]],
          width: hit_size,
          height: hit_size,
          placement: "center",
        },
        render: {
          kind: "screen_rect",
          anchor_doc: [p[0], p[1]],
          width: GHOST_VERTEX_SIZE,
          height: GHOST_VERTEX_SIZE,
          placement: "center",
          fill: true,
          stroke: true,
          shape: "circle",
          // Default: outlined like an idle vertex. Hover: hoverColor fill
          // (same hover affordance used by vertex/tangent knobs). Stroke
          // always uses handleStroke so the ghost remains visible against
          // any segment fill color.
          fillColor: is_hovered ? style.hoverColor : style.handleFill,
          strokeColor: style.handleStroke,
        },
        priority: GHOST_HANDLE_PRIORITY,
        cursor: "pointer",
      });
    }
  }

  // ─── 3. Tangent handles (PAIRED knob + DECORATIVE line) ────────────────
  const neigh = vector_overlay.neighbours;
  if (segments && neigh && neigh.length > 0) {
    const neigh_set = new Set(neigh);
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      const a_doc = offset_point(vector_overlay.vertices[seg.a], origin);
      const b_doc = offset_point(vector_overlay.vertices[seg.b], origin);
      const ta_doc = offset_point(seg.a_control, origin);
      const tb_doc = offset_point(seg.b_control, origin);

      if (neigh_set.has(seg.a)) {
        const key = `${seg.a}:0`;
        emit_tangent_handle({
          overlays,
          node_id,
          vertex_idx: seg.a,
          end: 0,
          anchor_doc: a_doc,
          control_doc: ta_doc,
          is_selected: selected_tangent_set.has(key),
          is_hovered: hovered_tangent_key === key,
          visual_size: tangent_visual_size,
          hit_size,
          style,
          group,
        });
      }
      if (neigh_set.has(seg.b)) {
        const key = `${seg.b}:1`;
        emit_tangent_handle({
          overlays,
          node_id,
          vertex_idx: seg.b,
          end: 1,
          anchor_doc: b_doc,
          control_doc: tb_doc,
          is_selected: selected_tangent_set.has(key),
          is_hovered: hovered_tangent_key === key,
          visual_size: tangent_visual_size,
          hit_size,
          style,
          group,
        });
      }
    }
  }

  // ─── 4. Vertex knobs (PAIRED) ──────────────────────────────────────────
  //
  // Painted LAST so they appear on top of segment outlines and tangent
  // lines.
  for (let i = 0; i < vector_overlay.vertices.length; i++) {
    const v = vector_overlay.vertices[i];
    const anchor_doc = offset_point(v, origin);
    const is_selected = selected_vertex_set.has(i);
    const is_hovered = hovered_vertex === i;

    overlays.push({
      label: `vertex:${i}`,
      group,
      action: {
        kind: "vertex_handle",
        node_id,
        index: i,
        pos: anchor_doc,
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
        width: visual_size,
        height: visual_size,
        placement: "center",
        fill: true,
        stroke: true,
        shape: "circle",
        // Hover wins over selected so the user always sees feedback for
        // the control under the cursor. Order: hovered → selected →
        // default. (Applies to every interactive overlay in this
        // package — vertex / tangent knob / segment outline / ghost.)
        fillColor: is_hovered
          ? style.hoverColor
          : is_selected
            ? style.handleStroke
            : style.handleFill,
        strokeColor: style.handleStroke,
      },
      priority: VERTEX_HANDLE_PRIORITY,
      cursor: "pointer",
    });
  }

  return { overlays };
}

/**
 * Resolve the polyline stroke color + width + opacity for a segment given
 * its (selected, hovered) state.
 *
 * Precedence: hovered → selected → idle. Hover wins so the user always
 * sees feedback for the control under the cursor — same precedence as
 * vertex / tangent / ghost knobs (see vector-chrome §"Hover wins").
 */
function segment_render_style(
  style: HUDStyle,
  is_selected: boolean,
  is_hovered: boolean
): { color: string; width: number; opacity: number } {
  if (is_hovered) {
    return {
      color: style.segmentActiveColor,
      width: style.segmentActiveWidth,
      opacity: style.segmentHoverOpacity,
    };
  }
  if (is_selected) {
    return {
      color: style.segmentActiveColor,
      width: style.segmentActiveWidth,
      opacity: 1,
    };
  }
  return {
    color: style.segmentIdleColor,
    width: style.segmentIdleWidth,
    opacity: 1,
  };
}

function emit_tangent_handle(args: {
  overlays: OverlayElement[];
  node_id: NodeId;
  vertex_idx: number;
  end: 0 | 1;
  /** Doc-space position of the anchoring vertex. */
  anchor_doc: [number, number];
  /** Doc-space position of the tangent control point. */
  control_doc: [number, number];
  is_selected: boolean;
  is_hovered: boolean;
  visual_size: number;
  hit_size: number;
  style: HUDStyle;
  group: HUDSemanticGroup | undefined;
}): void {
  const {
    overlays,
    node_id,
    vertex_idx,
    end,
    anchor_doc,
    control_doc,
    is_selected,
    is_hovered,
    visual_size,
    hit_size,
    style,
    group,
  } = args;

  // Skip degenerate (zero-length) tangents — there's nothing to grab.
  if (anchor_doc[0] === control_doc[0] && anchor_doc[1] === control_doc[1]) {
    return;
  }

  // (a) DECORATIVE line from vertex to control point. No hit region.
  //     Width 1 idle, width 2 selected (per `style.tangentLine*Width`).
  overlays.push({
    label: `tangent_line:${vertex_idx}:${end}`,
    group,
    action: {
      kind: "tangent_handle",
      node_id,
      tangent: [vertex_idx, end],
      pos: control_doc,
    },
    // Zero-area hit — purely visual. The knob carries the real hit.
    hit: {
      kind: "screen_aabb",
      rect: { x: 0, y: 0, width: 0, height: 0 },
    },
    render: {
      kind: "doc_line",
      x1: anchor_doc[0],
      y1: anchor_doc[1],
      x2: control_doc[0],
      y2: control_doc[1],
      color: style.tangentLineColor,
      strokeWidth: is_selected
        ? style.tangentLineActiveWidth
        : style.tangentLineIdleWidth,
    },
    priority: DECORATIVE_PRIORITY,
  });

  // (b) PAIRED knob at the control point.
  overlays.push({
    label: `tangent:${vertex_idx}:${end}`,
    group,
    action: {
      kind: "tangent_handle",
      node_id,
      tangent: [vertex_idx, end],
      pos: control_doc,
    },
    hit: {
      kind: "screen_rect_at_doc",
      anchor_doc: control_doc,
      width: hit_size,
      height: hit_size,
      placement: "center",
    },
    render: {
      kind: "screen_rect",
      anchor_doc: control_doc,
      width: visual_size,
      height: visual_size,
      placement: "center",
      fill: true,
      stroke: true,
      // Diamond knob: an axis-aligned square rotated 45°. Hit AABB stays
      // axis-aligned (render and hit live on independent shapes) so Fitts'
      // reach is identical to a circular knob of the same hit_size.
      shape: "rect",
      angle: Math.PI / 4,
      // Hover wins over selected — matches vertex/segment/ghost so the
      // user always sees feedback for the control under the cursor.
      fillColor: is_hovered
        ? style.hoverColor
        : is_selected
          ? style.handleStroke
          : style.handleFill,
      strokeColor: style.handleStroke,
    },
    priority: TANGENT_HANDLE_PRIORITY,
    cursor: "pointer",
  });
}
