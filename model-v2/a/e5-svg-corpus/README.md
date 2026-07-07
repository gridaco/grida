# E5 — SVG import corpus measurement

**Question.** Triage amendment 5 makes SVG import ≈100% a hard
requirement but left the carrying mechanism open (lens-quarantine default
vs declared degradation), to be decided by corpus measurement. How much
real SVG content actually exceeds the anchor header's native vocabulary
(bindings + size + rotation)?

**Method.** [`../lab/src/bin/e5scan.rs`](../lab/src/bin/e5scan.rs) scans
every `transform` / `gradientTransform` / `patternTransform` attribute,
composes each transform list into a 2×3 matrix, and classifies by the
decomposition `M = R(θ)·[sx m; 0 sy]`: identity/translate → bindings;
rotate → header rotation; scale (uniform or not, `m≈0`) → folds into
size; `det<0` → single-axis mirror (flip class); `|m|>ε` → true shear.
Geometry and paint transforms are tallied separately — a gradient's
matrix lives in the _paint_, never in node geometry.

**Corpus** (2026-07-07, repo-local): `fixtures/local` (6,626 wild
real-world files), `fixtures/test-svg` (37), `third_party/usvg` (62),
`packages/grida-canvas-sdk-render-figma` (333 Figma-derived),
`editor/public` (24), `public/slides-templates` (56) —
**7,138 files, 1,003,787 transforms** (613,084 geometry + 390,703 paint).

## Results

Geometry transforms by class:

| class                         | count       | share     | lands where         |
| ----------------------------- | ----------- | --------- | ------------------- |
| identity / translate          | 55,529      | 9.1%      | bindings            |
| rotate                        | 7,989       | 1.3%      | header `rotation`   |
| scale, uniform                | 121,268     | 19.8%     | size fold           |
| scale, non-uniform (no shear) | 262,607     | 42.8%     | size fold           |
| **flip (det < 0)**            | **159,872** | **26.1%** | ← the finding       |
| true shear                    | 5,809       | **0.95%** | lens                |
| unparsable                    | 10          | 0.002%    | lens (conservative) |

Per file: **57.8%** import fully natively as-is; **+23.9%** are blocked
_only_ by flips; **18.3%** contain ≥1 geometry shear (wild corpus 19.7%;
curated corpora 0–8.1%). Explicit `skewX/skewY` appears in only 44
files — shear arrives almost entirely as baked `matrix()`.

Paint transforms: 390,703 total, 17,872 with shear — none of them a node
problem (the paint model already carries full matrices). Splitting these
out cut the apparent "needs lens" file rate from 32.5% to 18.3%.

The verdict lives in [`verdict.md`](./verdict.md).
