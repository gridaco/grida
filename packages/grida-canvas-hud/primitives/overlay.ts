// HUDObject — the canonical bedrock primitive.
//
// One unit of HUD UI: a paint description, a hit region, a semantic
// group, a priority, and an opaque consumer-typed intent. Pairs the
// (visual, event, action) discipline explicitly so "render box ≠ event
// box" is structurally enforced.
//
// Bedrock invariants (encoded by the discriminated union below):
//
//   - `hit` absent  → paint-only object (visual chrome with no
//                      hover/cursor/intent observable).
//   - `hit` present, `intent` absent → silent affordance / hover-only
//                      (cursor and visual feedback can fire, no gesture
//                      commits).
//   - `hit` present, `intent` present → fully interactive.
//   - `hit` absent AND `render` absent → REJECTED by the type system.
//
// The `customHitTest` escape hatch from the legacy `OverlayElement`
// is removed; non-AABB shapes are first-class `HitShape` variants
// (`screen_circle_at_doc`, `screen_polygon`).
//
// `intent` is **opaque** to bedrock. Consumers parameterise
// `HUDObject<MyIntent>` with their own discriminated union; bedrock
// modules (e.g. `HitRegistry`) propagate the type unchanged.

import type cmath from "@grida/cmath";
import type { HUDPaint, HUDSemanticGroup } from "./types";
import type { CursorIcon } from "./cursor";

/**
 * Minimum hit-target size in screen-px.
 *
 * Visual knobs are typically 8px; the hit region is 16px so the user
 * does not need pixel-perfect aim (Fitts'). Bedrock constant — value
 * mirrors the legacy `event/overlay.ts` constant during the additive
 * migration.
 */
export const MIN_HIT_SIZE = 16;

/**
 * Below this selection size (in screen-px on either axis), chrome is
 * suppressed — both the visual handles AND the hit regions. The
 * consumer enforces this when computing per-frame `HUDObject`s.
 */
export const MIN_CHROME_VISIBLE_SIZE = 12;

// ─── HitShape — what triggers events ──────────────────────────────────────

/**
 * The hit region of a `HUDObject`. Always screen-space; the variants
 * differ on how the region is anchored.
 *
 * **Variants** (closed taxonomy — no host extension):
 *
 *  - `screen_rect_at_doc` — fixed screen-pixel rect, anchored to a
 *    doc-space point. The hit region tracks the document under camera
 *    changes; dimensions stay constant in CSS px. Used by handles.
 *
 *  - `screen_aabb` — pre-projected screen-space AABB. Used for
 *    overlays whose layout is already screen-space (edge strips).
 *
 *  - `screen_obb` — oriented bounding box. `rect` is axis-aligned in
 *    a shadow space; `inverse_transform` maps screen → shadow. Lets
 *    rotated chrome stay exact without AABB inflation.
 *
 *  - `screen_circle_at_doc` — fixed screen-pixel circle, anchored to a
 *    doc-space point. Used by vector-handle dots and parametric-handle
 *    knobs where a square hit region would feel wrong at the corners.
 *
 *  - `screen_polygon` — pre-projected screen-space polygon. Used by
 *    curved zones (variable-width controls, lasso previews) where AABB
 *    plus a `customHitTest` callback would otherwise leak host code
 *    into bedrock.
 */
export type HitShape =
  | {
      readonly kind: "screen_rect_at_doc";
      readonly anchor_doc: cmath.Vector2;
      /** Screen-space size in CSS px. */
      readonly width: number;
      readonly height: number;
      /** Which point of the rect sits on the anchor. Default: "center". */
      readonly placement?: "center" | "tl" | "tr" | "bl" | "br";
    }
  | {
      readonly kind: "screen_aabb";
      readonly rect: cmath.Rectangle;
    }
  | {
      readonly kind: "screen_obb";
      /** Axis-aligned rect in shadow space. */
      readonly rect: cmath.Rectangle;
      /** screen → shadow. Applied to the pointer before AABB containment. */
      readonly inverse_transform: cmath.Transform;
    }
  | {
      readonly kind: "screen_circle_at_doc";
      readonly anchor_doc: cmath.Vector2;
      /** Radius in screen CSS px. */
      readonly radius: number;
    }
  | {
      readonly kind: "screen_polygon";
      /** Pre-projected screen-space polygon vertices. */
      readonly points: ReadonlyArray<readonly [number, number]>;
    };

// ─── RenderShape — what gets drawn ────────────────────────────────────────

/**
 * The visual representation of a `HUDObject`. Maps directly onto the
 * primitive layer's `HUDDraw` entries; the consumer (or the deferred
 * orchestrator) fans these into one merged `HUDDraw` per frame.
 *
 * Closed taxonomy — same set as the legacy `OverlayElement.render`
 * union (`screen_rect`, `doc_rect`, `doc_line`, `doc_polyline`). No
 * new variants in bedrock; new render kinds land here only with ≥2
 * internal consumers shaped (sdk-design promotion bar).
 */
export type RenderShape =
  | {
      readonly kind: "screen_rect";
      readonly anchor_doc: cmath.Vector2;
      readonly width: number;
      readonly height: number;
      readonly placement?: "center" | "tl" | "tr" | "bl" | "br";
      readonly fill?: boolean;
      readonly stroke?: boolean;
      readonly fillColor?: string;
      readonly strokeColor?: string;
      readonly angle?: number;
      readonly shape?: "rect" | "circle";
    }
  | {
      readonly kind: "doc_rect";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly stroke?: boolean;
      readonly fill?: boolean;
      readonly fillOpacity?: number;
      readonly dashed?: boolean;
    }
  | {
      readonly kind: "doc_line";
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly dashed?: boolean;
      readonly strokeWidth?: number;
      readonly color?: string;
    }
  | {
      readonly kind: "doc_polyline";
      readonly points: ReadonlyArray<readonly [number, number]>;
      readonly stroke?: boolean;
      readonly fill?: boolean;
      readonly fillOpacity?: number;
      readonly strokeOpacity?: number;
      readonly strokeWidth?: number;
      readonly dashed?: boolean;
      readonly color?: string;
      readonly fillPaint?: HUDPaint;
    };

// ─── HUDObject — the unit of HUD UI ───────────────────────────────────────

/**
 * Fields common to every `HUDObject` variant.
 */
interface HUDObjectCommon {
  /** Optional debug label. Stable semantic identifier, e.g.
   *  `"resize_handle:nw"`, `"my-class:knob"`. */
  readonly label?: string;
  /** Semantic group, used by the consumer for visibility filtering. */
  readonly group?: HUDSemanticGroup;
  /** Lower wins on overlap. The consumer assigns the integer; bedrock
   *  treats it opaquely (sort key only). */
  readonly priority: number;
}

/**
 * Paint-only object: visual chrome that is never hit-tested.
 * `render` is required; `hit`, `intent`, `cursor` are forbidden.
 */
export interface HUDObjectPaintOnly extends HUDObjectCommon {
  readonly render: RenderShape;
  readonly hit?: never;
  readonly intent?: never;
  readonly cursor?: never;
}

/**
 * Interactive object: hit-testable; may also paint, carry an intent,
 * and a cursor. `hit` is required; the rest are optional.
 *
 * Sub-states (none enforced; documented for readers):
 *  - `intent` absent → silent / hover-only.
 *  - `intent` present → fully interactive.
 *  - `render` absent → silent affordance (invisible hit padding around
 *    a pre-painted target).
 */
export interface HUDObjectInteractive<I = unknown> extends HUDObjectCommon {
  readonly hit: HitShape;
  readonly render?: RenderShape;
  readonly intent?: I;
  readonly cursor?: CursorIcon;
  /**
   * Optional refinement applied AFTER `hit` containment passes. Return
   * `false` to reject the hit even though the shape contained the point.
   *
   * The point passed is the same screen-space point handed to
   * `HitRegistry.queryPoint`. Used by curve-shaped affordances (a path
   * segment's hit region is the bezier's bbox; the refinement asks "are
   * you actually near the curve in screen-px?") — the one real case that
   * an AABB/circle/polygon cannot express on its own.
   *
   * This is a deliberate, narrow escape hatch, restored after the
   * vector-path consumer proved an AABB-only hit model drops the
   * curve-near refinement. It is NOT a general "host runs arbitrary code
   * in the hit loop" door: it only *narrows* a shape that already
   * matched; it cannot widen one.
   */
  readonly refine?: (p: cmath.Vector2) => boolean;
}

/**
 * The canonical bedrock primitive — the value type a consumer
 * constructs to participate in HUD.
 *
 * Generic over the opaque intent type `I` the consumer supplies; both
 * bedrock and `HitRegistry<I>` propagate `I` unchanged.
 *
 * The discriminated union enforces the (`render` ∨ `hit`) invariant
 * at compile time: an object with neither field is not assignable to
 * either variant.
 */
export type HUDObject<I = unknown> =
  | HUDObjectPaintOnly
  | HUDObjectInteractive<I>;
