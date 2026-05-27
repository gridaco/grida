// ---------------------------------------------------------------------------
// Per-frame mirror of editor state → @grida/hud named-class setters.
//
// Called once per editor tick by `HUDHost.mirror`. Each named-class on the
// surface (padding, transform-box, corner-radius, vector, ruler, pixel-grid,
// cursor renderer) has a one-frame producer/consumer relationship with the
// editor; this file holds the wiring so `hud-host.ts` stays focused on
// lifecycle + intent translation.
//
// Phase 1: stub. Phases 3-7 incrementally fill this in. Each TODO carries
// the phase that owns it so Phase 10's sweep can verify nothing was missed.
// ---------------------------------------------------------------------------

import type { HUDHost } from "./hud-host";

/**
 * Mirror editor state onto the HUD surface's named-class setters.
 *
 * Intentionally takes the host (not the surface directly) so it can read
 * the cached selection rect / pick provider / editor snapshot without
 * re-plumbing them through arguments. Phase 1 does nothing; phases 3-7
 * fill in each set of TODOs below.
 *
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function syncHUDClasses(_host: HUDHost): void {
  // TODO(hud-replace-surface): Phase 2 — setPaddingOverlay when selection
  // is a flex-parent container (replaces the gesture/padding overlay's
  // current DOM rendering in surface.tsx).
  // TODO(hud-replace-surface): Phase 3 — setPixelGrid, setRuler,
  // setRulerTransform, setPixelGridTransform from editor.state config
  // (currently driven by `editor.config.ruler` / `editor.config.pixelGrid`).
  // TODO(hud-replace-surface): Phase 4 — setCursorRenderer with the bundled
  // cursors.defaultRenderer() (rotation-aware). Brush-tool exemption: when
  // editor.tool.kind === "brush", call setCursorRenderer(null) so the DOM
  // brush-cursor preview wins.
  // TODO(hud-replace-surface): Phase 5 — setCornerRadius for the resize
  // handle's promoted radius affordance (new HUD named class).
  // TODO(hud-replace-surface): Phase 7 — setVectorSelection + setTransformBox
  // wiring for content-edit-mode (vector, image fit, etc.).
}
