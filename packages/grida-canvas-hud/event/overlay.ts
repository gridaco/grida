import type cmath from "@grida/cmath";
import type { HUDSemanticGroup } from "../primitives/types";
import type { CursorIcon } from "./cursor";
import type { Rect } from "./gesture";
import type { OverlayAction } from "./hit-regions";

/**
 * Minimum hit-target size in screen-px.
 *
 * Visual knobs are typically 8px, but the hit region is 16px so users don't
 * need pixel-perfect aim. Matches `MIN_HIT_SIZE` in the Rust overlay.
 */
export const MIN_HIT_SIZE = 16;

/**
 * Below this selection size (in screen-px on either axis), chrome is
 * suppressed — both the visual handles AND the hit regions. Matches
 * `MIN_HANDLES_VISIBLE_SIZE` in the Rust overlay.
 */
export const MIN_CHROME_VISIBLE_SIZE = 12;

/**
 * How far the rotation halo extends diagonally outward from each
 * resize-corner zone.
 *
 * The rotation hit is a rect that WRAPS the resize corner — it extends
 * `ROTATION_WRAP` px outward from the resize rect along both axes of
 * the cardinal direction (e.g. NE rotation extends `+x` and `-y` past
 * the resize NE rect). The resulting rotation rect overlaps the resize
 * corner, the edge strips next to it, and the body interior near the
 * corner — but rotation has the LOWEST priority of any selection-
 * control zone, so it loses to all of them on overlap. The user only
 * sees the rotate cursor where no other affordance claims the pixel:
 * the L-strip immediately outside the resize corner's outer edges.
 *
 * Locked to `MIN_HIT_SIZE` so the rotation reach equals one handle
 * size — large enough to be a Fitts'-comfortable target, small enough
 * that the rotate cursor doesn't bleed into the middle of an edge.
 *
 * Note: the older single-square model used `ROTATION_OFFSET` to place
 * a 16×16 rect diagonally from each corner. That model always left
 * dead L-strips wrapping the corner at any zoom — the cardinal arms of
 * the L were never covered. The wrap-and-lose-on-overlap model
 * eliminates those gaps without introducing pixel overlap on the
 * cursor.
 */
export const ROTATION_WRAP = MIN_HIT_SIZE;

// ─── HitShape — what triggers events ──────────────────────────────────────

/**
 * A hit region for one overlay element. Always screen-space; either anchored
 * to a doc-space point (so the hit region tracks the document under camera
 * changes) or expressed as a pre-projected screen-space AABB (for things
 * like edge regions whose layout is fundamentally screen-space).
 */
export type HitShape =
  /**
   * Fixed screen-space rectangle, centered (or otherwise anchored) on a
   * doc-space point. The surface projects `anchor_doc` through the current
   * transform each frame; rect dimensions stay constant in CSS px.
   */
  | {
      kind: "screen_rect_at_doc";
      anchor_doc: cmath.Vector2;
      /** Screen-space size in CSS px. */
      width: number;
      height: number;
      /** Which point of the rect sits on the anchor. Default: "center". */
      placement?: "center" | "tl" | "tr" | "bl" | "br";
    }
  /**
   * Screen-space AABB at pre-projected screen coordinates. Used for elements
   * whose layout the chrome builder already projected (e.g. edge strips).
   */
  | {
      kind: "screen_aabb";
      rect: Rect; // screen-space
    }
  /**
   * Oriented bounding-box hit shape — an axis-aligned `rect` in a *shadow*
   * coordinate space, plus the affine that maps a screen-space pointer
   * INTO that space. The hit-test pipeline applies `inverse_transform` to
   * the pointer and then tests against `rect` with normal AABB containment.
   *
   * Used by transformed-chrome zones: the 9-slice runs in an axis-aligned
   * shadow rect centered at the chrome's screen center, and a rotation
   * (typically around the same center) maps shadow → screen. Storing the
   * inverse here lets hit-test stay exact at any rotation/skew without
   * inflating to an AABB-of-rotated-corners.
   */
  | {
      kind: "screen_obb";
      rect: Rect; // shadow-space (axis-aligned)
      /** screen → shadow. Applied to the pointer before AABB containment. */
      inverse_transform: cmath.Transform;
    };

// ─── RenderShape — what gets drawn ────────────────────────────────────────

/**
 * Visual representation for one overlay element. Maps directly to the
 * primitive layer's `HUDDraw` entries — the surface fans these out into the
 * one merged `HUDDraw` it hands to `HUDCanvas.draw()` each frame.
 *
 * Virtual elements (rotation, side resize) omit `render`.
 */
export type RenderShape =
  /** Screen-space sized rect at doc anchor — e.g. resize knob. */
  | {
      kind: "screen_rect";
      anchor_doc: cmath.Vector2;
      width: number;
      height: number;
      placement?: "center" | "tl" | "tr" | "bl" | "br";
      fill?: boolean;
      stroke?: boolean;
      fillColor?: string;
      strokeColor?: string;
      /**
       * Rotation around the rect's screen-space center, in radians (CCW).
       * Defaults to 0. Used for knobs/badges rendered for a transformed
       * selection so they rotate with the parent.
       */
      angle?: number;
      /**
       * Render shape — `"rect"` (default) or `"circle"` (ellipse inscribed
       * in the same bbox). Hit shape is unaffected; this only changes what
       * the canvas paints. Used by vector chrome for round vertex knobs.
       */
      shape?: "rect" | "circle";
    }
  /** Doc-space rect — e.g. selection outline, marquee. */
  | {
      kind: "doc_rect";
      x: number;
      y: number;
      width: number;
      height: number;
      stroke?: boolean;
      fill?: boolean;
      fillOpacity?: number;
      dashed?: boolean;
    }
  /** Doc-space line — e.g. line-shape selection outline. */
  | {
      kind: "doc_line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      dashed?: boolean;
      /** Stroke width in screen-space CSS px. */
      strokeWidth?: number;
      /** Override the canvas color for this line. */
      color?: string;
    }
  /** Doc-space polyline — used to draw an open curve as a sequence of
   *  flattened samples. Stroke width is in screen-px (the renderer
   *  divides by zoom). Used by vector chrome to outline each segment of
   *  a path under content-edit. */
  | {
      kind: "doc_polyline";
      points: ReadonlyArray<readonly [number, number]>;
      stroke?: boolean;
      fill?: boolean;
      fillOpacity?: number;
      strokeOpacity?: number;
      strokeWidth?: number;
      dashed?: boolean;
      color?: string;
    };

// ─── OverlayElement — the unit of overlay UI ──────────────────────────────

/**
 * One interactable element of overlay UI.
 *
 * Pairs (visual, event, action) into a single struct so the discipline of
 * "render box ≠ event box" is explicit. The chrome builder emits a list of
 * these per frame; the surface fans them into render commands and hit
 * regions.
 *
 * - **Virtual elements** (e.g. rotation handles, edge resize strips) omit
 *   `render` — they exist only as hit regions.
 * - **Padded elements** have `hit` larger than the corresponding `render`
 *   shape (e.g. 16px hit AABB around an 8px visual knob).
 *
 * TODO(rotation): when the first base-rotated overlay lands (e.g. an
 * in-canvas rotation pip), add an `orientation: "screen" | "base"` field.
 * Existing call sites default to `"screen"` and don't change.
 */
export interface OverlayElement {
  /** Stable semantic identifier. Format: `"<kind>[:<param>]"`. Examples:
   *  `"translate"`, `"resize_handle:nw"`, `"resize_edge:n"`,
   *  `"rotate:ne"`, `"endpoint:p1"`. Used by tests and debug tooling. */
  label: string;
  /** Semantic owner for group-level visibility policy. */
  group?: HUDSemanticGroup;
  action: OverlayAction;
  hit: HitShape;
  render?: RenderShape;
  /** Lower wins. See `HUDHitPriority` in `selection-controls.ts`. */
  priority: number;
  cursor?: CursorIcon;
  /**
   * Optional refinement layered on top of the AABB hit check. Receives the
   * screen-space pointer (or shadow-space, when `hit.kind === "screen_obb"`
   * and the registry has applied `inverse_transform`). Returns false to
   * reject the hit even though the AABB matched.
   *
   * Used by curve-shaped hit regions (e.g. path segments) — the AABB is
   * the bezier's bbox, the refinement asks "are you actually near the
   * curve in screen-px?"
   */
  customHitTest?: (point: cmath.Vector2) => boolean;
}
