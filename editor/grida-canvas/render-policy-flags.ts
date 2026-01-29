/**
 * Render-policy bitflags used by the WASM renderer.
 *
 * **Source of truth**: `crates/grida-canvas/src/runtime/render_policy.rs`
 *
 * These flags are an ABI boundary between the TypeScript editor runtime and the
 * Rust renderer (via `@grida/canvas-wasm`).
 *
 * Notes:
 * - The values must remain stable across both sides.
 * - Prefer using {@link computeRenderPolicyFlagsForOutlineFeature} rather than
 *   composing flags ad-hoc at callsites.
 */

/** Enable node fills in the standard pipeline. */
export const FLAG_RENDER_FILLS = 1 << 0;
/** Enable node strokes in the standard pipeline. */
export const FLAG_RENDER_STROKES = 1 << 1;
/** Force geometry-only outlines (wireframe) regardless of node paints. */
export const FLAG_RENDER_OUTLINES_ALWAYS = 1 << 2;
/** Enable effects (shadows/blur/noise/backdrop, etc.) in the standard pipeline. */
export const FLAG_EFFECTS_ENABLED = 1 << 3;
/** Enable compositing state (opacity/blend/masks/clips) in the standard pipeline. */
export const FLAG_COMPOSITING_ENABLED = 1 << 4;
/**
 * Ignore clip paths / masks when rendering.
 *
 * This is only meaningful when combined with an inspection mode (e.g. outlines),
 * and the editor intentionally only enables it when outlines are on.
 */
export const FLAG_IGNORE_CLIPS_CONTENT = 1 << 5;

/**
 * Compute render-policy flags for the editor's \"Outlines\" feature group.
 *
 * - When `outline_mode` is `"on"`, the renderer is switched to wireframe mode.
 * - When `outline_mode` is `"off"`, the renderer uses the standard pipeline
 *   (fills + strokes + effects + compositing).
 * - The `outline_mode_ignores_clips` preference is only effective while outlines
 *   are enabled; otherwise `FLAG_IGNORE_CLIPS_CONTENT` is not set.
 */
export function computeRenderPolicyFlagsForOutlineFeature(
  outline_mode: "on" | "off",
  outline_mode_ignores_clips: boolean
): number {
  const flags =
    outline_mode === "on"
      ? FLAG_RENDER_OUTLINES_ALWAYS
      : FLAG_RENDER_FILLS |
        FLAG_RENDER_STROKES |
        FLAG_EFFECTS_ENABLED |
        FLAG_COMPOSITING_ENABLED;

  // Preference is only effective while outlines are enabled.
  return outline_mode === "on" && outline_mode_ignores_clips
    ? flags | FLAG_IGNORE_CLIPS_CONTENT
    : flags;
}
