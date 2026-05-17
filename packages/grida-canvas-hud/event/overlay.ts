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
 * Rotation handle hit center sits this many screen-px outside each corner.
 */
export const ROTATION_OFFSET = 12;

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
}
