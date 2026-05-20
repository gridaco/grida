// Parsed shape of the SVG `transform` attribute. Angles in degrees.
// Defaults from SVG 1.1 §7.6 are normalized into the parsed op (e.g.
// `translate(10)` → `{ tx: 10, ty: 0 }`); the emitter re-applies the
// verbose form so the round-trip is parse-stable even when the source
// elided defaults.

export type TransformOp =
  | {
      type: "matrix";
      a: number;
      b: number;
      c: number;
      d: number;
      e: number;
      f: number;
    }
  | { type: "translate"; tx: number; ty: number }
  | {
      type: "rotate";
      angle: number;
      cx: number;
      cy: number;
      /** True iff parsed from `rotate(θ cx cy)`. False iff from `rotate(θ)`
       *  (origin pivot). Parser-set; emitter-ignored. */
      explicit_pivot: boolean;
    }
  | { type: "scale"; sx: number; sy: number }
  | { type: "skewX"; angle: number }
  | { type: "skewY"; angle: number };
