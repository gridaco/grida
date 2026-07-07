# E5 verdict — SVG import mechanism

**Decision: quarantine confirmed for shear; and the corpus forces one
spec amendment — flip must be native.** Amendment 5's ≈100% requirement
is achievable with zero degradation.

## The four rulings

1. **Flip goes native (spec amendment proposal, measured).** Single-axis
   mirrors are **26.1% of all geometry transforms** (159,872 occurrences;
   sole blocker for 23.9% of files) — the standard y-up→y-down and
   mirrored-asset idioms of real SVG. A quarantine that fires on a
   quarter of wild files is not a quarantine. Proposal for phase 3: two
   header booleans `flip_x` / `flip_y` (applied about the box center,
   after rotation semantics are unchanged) — scalar intent, CRDT-atomic,
   animatable, and exactly what Figma exposes. This answers conformance
   **R-E5** ("declared representation for negative-determinant
   transforms"). With native flip, per-file native coverage rises from
   57.8% → **81.7%**.
2. **Lens is the right home for true shear.** Genuine shear is **0.95%**
   of geometry transforms — per-transform it is exactly the exceptional
   class the lens was designed for (H8: wrap, never silent loss). It
   appears in 18.3% of _wild_ files (0–8% in curated corpora), typically
   on a handful of nodes per file — an acceptable wrap rate for content
   that genuinely is sheared. Degradation is unnecessary: only 10 of a
   million transforms were unparsable (wrapped conservatively).
3. **Paint transforms never touch the node model.** 390k gradient/pattern
   matrices (including all 17,872 paint shears) belong to the paint,
   which already carries a full 2×3 in Grida. Importer rule, locked:
   `gradientTransform`/`patternTransform` → paint transform, never a
   lens. (Skipping this split overstates the lens rate by 14 points —
   the measurement that justified the rule.)
4. **X-SVG-1/2/3 verdicts confirmed as written**: translate/rotate/scale
   lists import losslessly into bindings/rotation/size (73% of geometry
   transforms immediately, no structure added); skew/matrix = "Y-with-
   structure" via lens; `x/y` attr + `translate()` compose into one
   binding offset at import.

## What this cost the model

One honest widening: the header grows two booleans. The alternative —
lens-wrapping a quarter of imported files — would have diluted H5's
"matrices are tier-2 only" story far more than two flip bits do. The
scale fold (62.6% of transforms landing in `w`/`h`) confirms the
size-free shape-descriptor design (`CanonicalLayerShape` direction) pulls
its weight in practice.

Reproduce: `cargo run --release --bin e5scan -- <corpus dirs>` from
`../lab`.
