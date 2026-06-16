// Text-edit — public input types.
//
// The host-pushed contract for inline-text-edit chrome: a caret + selection
// highlights, expressed in a LOCAL coordinate space with a `transform` that
// maps local → world/doc. Decoration-only — no gestures, intents, or hit
// regions (unlike padding/transform-box). Everything here is `@unstable`
// until a second independent integration ratifies the shape.

import type cmath from "@grida/cmath";
import type { HUDSemanticGroup } from "../../primitives/types";

/**
 * Caret as two LOCAL endpoints (top, bottom) — NOT a position + height. Two
 * endpoints let the `transform` tilt/scale the caret as a true affine of a
 * line segment, which a `{x, top, height}` triple cannot. This is the honest
 * shape for rotated text and the future per-run textPath case; the common
 * axis-aligned caret maps trivially (`top=[x, m.top]`, `bottom=[x, m.top+h]`).
 *
 * @unstable
 */
export interface TextEditCaret {
  /** Caret top endpoint, local space. */
  top: cmath.Vector2;
  /** Caret bottom endpoint, local space. */
  bottom: cmath.Vector2;
}

/** One selection-highlight rect in LOCAL space. @unstable */
export interface TextEditSelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Optional visual overrides; the builder supplies defaults when absent. @unstable */
export interface TextEditChromeStyle {
  /** Caret fill color. Default `#2563eb`. */
  caretColor?: string;
  /** Caret on-screen thickness in CSS px (zoom-independent). Default 1.5. */
  caretScreenWidth?: number;
  /** Selection fill color. Default `#2563eb`. */
  selectionColor?: string;
  /** Selection fill opacity, 0–1. Default 0.25. */
  selectionOpacity?: number;
}

/**
 * Host-pushed text-edit chrome (caret + selection highlights). All geometry
 * is LOCAL; `transform` maps local → world/doc. The HUD composes `transform`
 * with its own camera (world → screen) at draw time, so the chrome places
 * correctly under arbitrary affines (rotated text, nested `<g>` transforms).
 *
 * This is the focused generalization that anticipates `<textPath>` WITHOUT
 * per-glyph path-following: a textPath host emits per-run caret/rects in each
 * run's local frame and the same composition applies. A single affine cannot
 * express a curved baseline — that remains out of scope.
 *
 * Schema-level feature flag — pass `null` to `setTextEditChrome` to disable.
 * The caret blinks via the host re-pushing with a flipped `caretVisible`.
 *
 * @unstable
 */
export interface TextEditChromeInput {
  /** local → world/doc affine. cmath.Transform is a full 2×3 (carries shear). */
  transform: cmath.Transform;
  /** Caret geometry; omit when there is no caret (e.g. read-only highlight). */
  caret?: TextEditCaret;
  /** Caret blink/visibility. The caret draws only when `caret` is set AND this is true. */
  caretVisible?: boolean;
  /** Selection-highlight rects, local space. Empty/omitted = no selection. */
  selectionRects?: readonly TextEditSelectionRect[];
  /** Visual overrides; builder defaults when absent. */
  style?: TextEditChromeStyle;
  /**
   * Optional semantic group for the visibility policy. Stamped on every
   * emitted primitive so a host can suppress the whole chrome atomically.
   * Default: always rendered while set (the active edit locus has no gesture
   * during which you'd want it hidden).
   */
  group?: HUDSemanticGroup;
}
