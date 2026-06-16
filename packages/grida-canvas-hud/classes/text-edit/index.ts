// Text-edit — named-class entry point.
//
// Re-exports the class's public surface. Decoration-only, so the split is
// thinner than padding/transform-box (no intent.ts / priority.ts):
//
// - surface.ts   the chrome builder + anti-goals + caret-width constant
// - input.ts     TextEditChromeInput + sub-types
//
// @unstable — svg-editor is the only consumer; the main canvas editor paints
// its caret in WASM/Skia and does not consume this.

export type {
  TextEditCaret,
  TextEditChromeInput,
  TextEditChromeStyle,
  TextEditSelectionRect,
} from "./input";
export {
  buildTextEditChrome,
  DEFAULT_CARET_SCREEN_WIDTH,
  type TextEditChromeDraw,
} from "./surface";
