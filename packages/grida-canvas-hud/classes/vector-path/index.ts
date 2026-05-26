// Vector-path — named-class entry point.
//
// One model (a path), one chrome (segment outlines + vertex knobs +
// tangent handles + region bodies + ghost insertion knob), one closed
// gesture grammar across 10 intent variants. Densest class in the
// package; still one identity, one noun (`vector-path`).

export type {
  VectorOverlay,
  VectorChromeInput,
  VectorChromeOutput,
} from "./input";
export type { VectorPathIntent } from "./intent";
export { buildVectorChrome } from "./surface";
