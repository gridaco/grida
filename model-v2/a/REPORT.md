# REPORT — prove `anchor`

Autonomous run, 2026-07-07. Goal: **prove Model A** (`anchor`,
[`../models/a.md`](../models/a.md)) by building it and running the
experiment ledger ([`README.md`](./README.md)), ending in
win / lose / lessons-learnt.

## Verdict: WIN — with five earned amendments and an honest loss column

The model was implemented end-to-end in a standalone lab crate
([`lab/`](./lab), ~2,300 lines incl. tests, not wired into the repo
workspace), and every core claim of the spec survived contact with
execution — but not unchanged: implementation forced five concrete spec
corrections that document review had not found. That is what "proven"
means here: the model works, and we now know _where its paper version
was wrong_.

## Scoreboard

| exp                     | question                          | verdict                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lab core**            | does the model implement?         | **56/56 conformance-derived tests green** — MM-1/2/3/4/5/6/7/9, G-1/2/4/5/E1/E2/E3, R-1/2/3(both arms)/4/5/E1, L-3/4/5/7/E1/E3, T-1, D-1/2/3/6/E1, lens transparency, ops write-counts, typed errors, M-6, NaN boundary, IR round-trip                                                                                                                                                                                    |
| **E1** rotation-in-flow | AABB-participates vs visual-only  | **DECIDED: layout-visible** — 0 px² overlap at every angle vs 1,830 px² in the CSS arm; displacement smooth (≤3.45 px/2°, inside the √(w²+h²) analytic bound); rotate stays a 1-field write; container breathing (56.6 px full-spin) _confirms_ the two-lane motion rule instead of weakening the decision. R-3/OP-ROT-2 → INV. [verdict](./e1-rotation-in-flow/verdict.md), [demo.html](./e1-rotation-in-flow/demo.html) |
| **E2** format           | encodes under fbs header rules?   | **PASS** — schema compiles; JSON→bin→JSON→bin **byte-identical** (S-1); structural unset witnessed in output (H11); additive evolution both directions (M-4). One policy owed: RMW-preservation of unknown fields. [verdict](./e2-format/README.md)                                                                                                                                                                       |
| **E3** agent text IR    | can an LLM predict geometry cold? | **VALIDATED** — two frontier agents **22/22 (100%)** from a 150-line grammar alone, including wrap arithmetic, grow, hug, rotated-in-flow, group origin rule; small-model control 17/22 with slip-class errors only. [verdict](./e3-text-ir/verdict.md)                                                                                                                                                                   |
| **E4** resolver spike   | architecture viable?              | **VIABLE** — 10k free nodes / 5.4 ms, all-flex worst case 237 nodes/ms linear, 18 µs subtree locality bound; replaces the 26-arm branch forest + `atan2` reconstruction + `MIN_SIZE_DIRTY_HACK` with ~700 uniform lines. Two Taffy dependency findings. [verdict](./e4-resolver/verdict.md)                                                                                                                               |
| **E5** SVG corpus       | quarantine vs degrade?            | **MEASURED: quarantine + one amendment** — 1,003,787 transforms / 7,138 files: true shear is 0.95% (lens is right); **flip is 26.1% → must be native** (`flip_x`/`flip_y` header bools); paint transforms (39%) never touch node geometry. [verdict](./e5-svg-corpus/verdict.md)                                                                                                                                          |
| **E6** pluggable layout | the #28 curiosity                 | sketched, non-binding: the `(contributions → slots)` seam already exists because E1's rotated AABBs forced it; keep core at two modes, E3 is the veto. [sketch](./e6-pluggable-layout/SKETCH.md)                                                                                                                                                                                                                          |

## What implementation forced into the spec (the run's real yield)

These are the deltas `models/a.md` must absorb in its phase-3 rewrite —
each one was _discovered by a failing test or a measurement_, not by
argument:

1. **E-A1 — derived-box bindings place the origin, not the union box.**
   The naive reading of §2.1 (bindings position the box) makes D-2 fail:
   moving child A shifts the union, which re-places the box, which moves
   sibling B in world space — the exact P6 instability the model exists
   to kill. §8's phrase "places the _space_" must be promoted to a
   normative rule: pins bind the group-space origin; the reported box is
   `origin + union`; reads report the box; writes re-target by delta.
   (Found by `d2_sibling_stability_under_rotated_group` failing.)
2. **E-A2 — native flip.** Two header booleans (`flip_x`/`flip_y`),
   center-applied. Measured justification: 159,872 single-axis mirrors
   in the wild corpus — a "quarantine" firing on 24% of files is not a
   quarantine. Answers R-E5. (E5)
3. **E-A3 — the two stretches are different rules and must be headlined:**
   container `cross:"stretch"` affects only auto-cross children; child
   `align:"stretch"` means _fill_ and overrides Fixed (it is the format's
   only cross-axis fill, per §2.2's no-Fill design). The first grammar
   draft under-specified this and the truth run caught it. (E3)
4. **E-A4 — grow × rotation declared:** grow expands the _slot_; a
   rotated child's box keeps its basis, centered in the grown slot.
   (Lab policy that needs spec text; found writing the flex path.)
5. **E-A5 — underdetermined-binding rules:** End/Center/Span pins under
   a derived-box parent or an Auto-hug free frame are `error-by-rule`
   (reported, resolved as Start) — the spec's applicability matrix has
   no row for these; now it needs one.
6. **E-A6 — M-4 needs a policy, not a hope:** FlatBuffers read-skips
   unknown fields but decode→re-encode through an old schema _drops_
   them (verified). Choose: buffer-retention patching, or writers
   version-gated to newest schema. (E2)
7. **E-A7 — editor note:** the rotated envelope peaks at
   `θ* = atan(h/w)`, not 90° — HUD affordances should surface the
   envelope or mid-turn width reads as a bug. (E1)
8. **E-A8 — the lens-only-rotate lint must be context-scoped** (owner
   question, post-run): a.md §3.3 flags a lens containing only `Rotate`
   as "use header rotation" — but under the E1-locked semantics,
   lens-rotate **in flow** is the legitimate, structurally-distinct
   escape to paint-only rotation (proven: `lens_rotate_is_the_visual_only_twin`
   reproduces the CSS arm exactly under the default flag). The lint
   applies only in _free_ context, where header rotation is equivalent.
9. **E-A9 — vector adopts the reference-space mapping** (owner question
   → E7 research, 2026-07-07): `vector` changes from "measured box, no
   size intent" to points-in-reference-space + ordinary size intent,
   mapped by `resolved_size / reference_size` at render — the structure
   Sketch (normalized 0–1 points, no transform in format) and Figma
   (`normalizedSize`) both converged on. Kills the current editor's
   per-resize vertex bake (verified outlier), defines vectors under
   grow/stretch, keeps resize a 1–2 field write. Refinement from our own
   io-figma notes: the reference space is a **rect, not a size**
   (observed non-zero blob origins) — store a reference rect or
   normalize origin at write. Reference implementation already in-repo:
   `scaleVectorNetworkFromNormalizedSize` (io-figma lib.ts) + the
   fixture test proving Figma ships `normalizedSize != size` nodes.
   See [`e7-shape-points-scale/`](./e7-shape-points-scale/README.md).
10. **E-A10 — the two-scales rule, locked** (E7): plain resize =
    geometry re-evaluation with px-stable styles (non-scaling-stroke by
    construction); parameter scale (K) stays an op-layer bake (Grida
    already ships `parametric_scale`, = Figma `rescale()`); retained
    picture-scale (strokes + image fills scale) exists only as a lens
    `Scale` op. Image fills always re-fit at the resolved box per fit
    mode — never baked, never rasterized with the shape. The
    Framer/Sketch `<Graphics>` container is rejected as a requirement
    (evidence: its mandatoriness is their documented pain), kept as the
    lens escape.
11. **E-A11 — grow × rotation continuity** (pedantic pass + edge sweep,
    2026-07-07): E-A4 as declared is discontinuous — a `grow:1` card
    snaps from filled (300 px) to basis (60 px) at the first degree of
    rotation (measured 240 px/3° jump, `edge-cases/` scene `grow`).
    Fix direction: inverse-envelope fill (box takes the largest extent
    whose rotated envelope fits the grown slot — continuous at 0°).
12. **E-A12 — stretch/re-measure × rotation declared** (same pass):
    the lab silently skips stretch and text re-measure for rotated
    in-flow children — the unstated rule that makes "zero overlap" and
    "single-pass" true. Promote to spec text (ignored-by-rule **with
    report** for θ≠0), same continuity treatment as E-A11 (measured
    170→100 px pop, scene `stretch`).
13. **E-A13 — group constraint transparency** (owner question + verified
    Figma research, 2026-07-07): binding reference = nearest non-derived
    ancestor (Figma-parity pass-through), acyclic _because of_ E-A1's
    stored origins — no re-fit writes needed; AL child-props do NOT pass
    through (verified Figma parity); v1 restricts non-Start pins to
    unrotated derived chains. Full chapter: [`GROUP.md`](./GROUP.md).
14. **E-A14 — flip semantics built** (owner-raised cross-zero red flag,
    2026-07-07): the four evidence-forced facts — pivot per kind exactly as
    rotation (pedantic B1, now lab-tested: D-2 holds under a flipped
    group); composition **innermost** (`T·R·F`, mirror first, then turn);
    flip is **layout-invisible by construction** for boxed kinds
    (center-applied ⇒ AABB unchanged — the one transform that never pops
    layout); extents stay non-negative bedrock (`set_width(−50)` =
    typed `NegativeExtent`, doc untouched) while the DRAG re-targets
    (|extent| + flip toggle + re-pin, out-and-back = document identity).
    Ungroup bakes flips exactly via mirror conjugation
    (`F·R(θ) = R(σθ)·F`, σ = −1 iff single-axis). 11 tests
    ([`lab/tests/flip.rs`](./lab/tests/flip.rs)); which gesture POLICY
    ships (wall/slide/flip) is open — [`DECISIONS.md`](./DECISIONS.md)
    DEC-9, demo'd in [`edge-cases/`](./edge-cases).
15. **Pedantic review (2026-07-07)** — full findings, lock conditions,
    and two new ledger experiments (**E8** CSS-projection measurement;
    **E9** Figma-corpus scan): [`pedantic-review.md`](./pedantic-review.md).
    MODEL.md surgically corrected same day (bool cell, law 8 two
    regimes, E-A5 acyclicity guard stated, locality qualified, E3
    caveat, law 6 marked open-pending-lock).
16. **DEC-0 second lock — the default is VISUAL-ONLY (owner framing,
    2026-07-07):** rotation is a post-layout paint transform; sizing is
    CSS-pure (never reads rotation/flips — flex, hug, derived unions);
    reads stay oriented. Supersedes E1's default; the E1 arm remains
    implemented + tested as the documented alternative. The gated spec
    review found and closed one real UB (the V-4 group-box fork — a
    derived box's four consumers could read two different values;
    decided: sizing-tier union). Normative rules:
    [`dec0-visual-only.md`](./dec0-visual-only.md); conformance:
    `lab/tests/visual_only.rs` (suite 114). Retires E-A4/E-A7/E-A8/
    E-A11/E-A12; closes DEC-1/2/3 n/a.
17. **Dependency guards (phase 4):** Taffy rounds unless disabled (L-7);
    Taffy's intrinsic pass inflates growable-item contributions by the
    container's own padding, deviating from L-3 _and_ Chromium — guard by
    stripping grow in indefinite-main intrinsic runs, and pin L-3's
    conformance test to Chromium, never to the layout library. (E4)

## Lose column — what this run did not prove

- **Payload coverage**: `tray`, `image`, `embed`, `vector`, `bool` were
  not implemented (no new geometry mechanism among them — but "no new
  mechanism" is itself an unproven claim for `bool`'s op-result box).
- **Wrap** got minimal exercise; **grid** none (additive future by
  design, untested by construction).
- **CRDT**: C-1/C-5 were demonstrated as field-level merges in tests,
  but no real replicated backend ran the C-matrix.
- **No incremental resolver**: locality was _bounded_ (18 µs/subtree),
  not implemented; N-4's invalidation claim rests on phase-order
  structure plus that bound.
- **"Feel" by proxy**: E1 measured overlap/continuity/breathing and
  ships an interactive demo, but no human ran the scrubber yet — the
  owner should open `e1-rotation-in-flow/demo.html` and disagree if the
  numbers lied.
- **E3 n=3**: two frontier + one small model, six documents. Convincing
  signal, small sample; the probe protocol is repeatable on demand.
- **Text IR carries no node ids** — authoring round-trips; _editing_
  identity does not yet (recorded in the E3 verdict).
- The lab's per-container Taffy runs and hug double-pass mean E4's flex
  numbers are a floor, not an engine benchmark.

## Lessons learnt

1. **Building found what reviewing could not.** Five of the eight spec
   deltas came from failing tests or corpus counts, none from re-reading
   the documents. The triage's "challenge the ideal empirically" posture
   (#5) was the single highest-yield decision of the whole model-v2
   effort.
2. **The best correction came from the model's own test.** D-2
   (sibling stability) is _in the conformance corpus because the paper
   analysis said groups were solved_. The test disagreed with the
   implementation of the paper's own words — "places the space" turned
   out to be load-bearing prose nobody had cashed out. Write the test
   corpus before believing the prose.
3. **Dependencies are spec surface.** Two Taffy behaviors (rounding,
   intrinsic grow inflation) would have silently become "the model" had
   the lab pinned tests to the library instead of to declared rules.
   Conformance oracles must outrank implementation convenience.
4. **Sentinel-freedom is cheap at birth, expensive to retrofit** — the
   whole H11 discipline cost one afternoon in a fresh schema (flatc
   proved unset-vs-default structurally in the decoded JSON), versus the
   `max_lines: 0` / `(0,0)-aspect` hacks the current format carries.
5. **LLM-predictability works as a design _instrument_, not just a
   requirement**: prediction failures localize spec ambiguity (the
   small model's slot-center slip and the stretch gap were both wording
   defects surfaced as wrong numbers). Re-run the E3 probe after every
   grammar change; treat sub-100% frontier scores as spec bugs.
6. **Measure the corpus before designing the escape hatch.** The lens
   was designed for skew; the corpus said the real problem was flips —
   a class nobody had ranked. One scanner afternoon re-ranked the
   priorities of the capability model.

## What's next (phase 3, unchanged in shape, now unblocked)

Rewrite `models/a.md` as the normative spec with E-A1…E-A7 folded in and
every conformance `POL` locked (R-3 now INV); graduate the WG write-up
per docs-wg doctrine; promote `anchor.fbs` + the text-IR grammar to spec
appendices; then phase 4 against the real engine with the two Taffy
guards. Nothing in this run is committed to git — the whole workbench
remains untracked working state for the owner to review.
