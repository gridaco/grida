// Padding — named-class entry point.
//
// Re-exports the class's public surface for consumers (package index,
// Surface orchestrator, event/* dispatchers that need the input/hover
// types). Internal split:
//
// - surface.ts   the chrome (build function + helpers + anti-goals)
// - input.ts     PaddingOverlayInput + PaddingHover
// - intent.ts    PaddingIntent variant (folded into Intent by event/intent.ts)
// - priority.ts  priority slots + sizing constants

export type { PaddingOverlayInput, PaddingHover } from "./input";
export type { PaddingIntent } from "./intent";
export {
  PADDING_HANDLE_PRIORITY,
  PADDING_REGION_PRIORITY,
  PADDING_HANDLE_LENGTH,
  PADDING_HANDLE_THICKNESS,
} from "./priority";
export {
  buildPaddingOverlay,
  paddingSideRect,
  projectPaddingValue,
} from "./surface";
