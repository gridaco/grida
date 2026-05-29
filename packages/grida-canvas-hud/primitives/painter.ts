// Painter — bedrock 4-method interface.
//
// The abstraction that lets a `HUDObject` set render to any 2D backend
// (canvas2d today; SVG, DOM, native — all future). Bedrock-pure: knows
// nothing about specific HUD classes (rulers, corner-radius, …). Frame-
// to-frame state for classes that need memoization lives on the
// consumer side, never inside the painter.
//
// The legacy `surface/painter.ts` exposes 10 methods including class-
// specific setters (`setRuler`, `setCornerRadiusHandles`,
// `setPixelGrid`, `setParametricHandles`). Those are class opinions on
// the painter and stay in the legacy file until the deferred
// orchestrator follow-up dissolves the legacy shape.
//
// Anti-goals (defended in the package README):
//
//   - **Not a renderer.** The host renderer paints document content;
//     this painter paints HUD chrome only.
//   - **Not a state holder.** No per-frame caches, no class-specific
//     setters. `draw(d)` is the only paint API.

import type cmath from "@grida/cmath";
import type { HUDDraw } from "./types";

/**
 * Per-frame viewport state handed to `beginFrame`.
 */
export interface PainterViewport {
  /** Width in CSS pixels. */
  readonly w: number;
  /** Height in CSS pixels. */
  readonly h: number;
  /** Device-pixel ratio. */
  readonly dpr: number;
}

/**
 * Backend-agnostic chrome painter.
 *
 * Bedrock contract — exactly four methods. Concrete implementations
 * (`primitives/painter-canvas2d.ts` ships canvas2d) may add private
 * helpers, but the public interface is frozen at this shape.
 *
 * Frame lifecycle:
 *
 *   1. `beginFrame(viewport)` — clear or prepare the backing surface.
 *   2. `setTransform(t)` — set the camera (doc → screen affine). May
 *      be called multiple times within a frame.
 *   3. `draw(d)` — submit a `HUDDraw` payload. May be called multiple
 *      times within a frame; payloads accumulate.
 *   4. `endFrame()` — commit. The backing surface displays the frame.
 *
 * Implementations MAY no-op `endFrame` (canvas2d does); SVG/DOM
 * backends use it to flush DOM mutations in a single batch.
 */
export interface Painter {
  /** Start a new frame. Implementations clear / reset state here. */
  beginFrame(viewport: PainterViewport): void;

  /** Set the camera (doc → screen). */
  setTransform(t: cmath.Transform): void;

  /** Paint a `HUDDraw` payload. Calls accumulate within a frame. */
  draw(d: HUDDraw): void;

  /** Commit the frame. Implementations flush their backing surface. */
  endFrame(): void;
}
