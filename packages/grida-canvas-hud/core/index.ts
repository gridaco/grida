// `core/` — bedrock engine mechanisms.
//
// Independently-testable modules. No master class, no extension API,
// no class-specific knowledge. Each module is a separate export with
// a unit test in `__tests__/core/`.
//
// Deferred (out of bedrock scope until orchestrator follow-up):
//
//   - `core/gesture-fsm.ts` — gesture state-machine mechanism. The
//     class-specific kinds in legacy `event/gesture.ts` are deeply
//     intertwined with the state holder (`event/state.ts`); the
//     bedrock carve waits on the orchestrator design.
//
//   - `core/decision.ts` — decision-tree mechanism. The legacy
//     `event/decision.ts` (1329 LOC) bundles the singleton-vs-
//     ambiguous discriminator with the 30+ named scenarios; the
//     bedrock carve waits on `classes/` walking ≥3 real scenarios.
//
// Both are documented as outstanding bedrock work in the README's
// stability banner.

export {
  type Modifiers,
  NO_MODS,
  type PointerButton,
  type HUDEvent,
  type Vector2,
} from "./event";

export { ClickTracker, type ClickTrackerOptions } from "./click-tracker";

export {
  type Transform,
  IDENTITY,
  screenToDoc,
  docToScreen,
  zoomOf,
} from "./transform";

export { NamedRegistry, RegistrationError } from "./registry";

export { HitRegistry, shapeContains } from "./hit-registry";
