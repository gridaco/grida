# E1 — rotation-in-flow prototype

**Question.** A rotated child inside a flex flow: does layout see it — the
oriented AABB participates and siblings make room (`anchor` §5) — or is
rotation paint-only, layout frozen, overlap correct (CSS `transform`
semantics)? The model-v2 triage left this as the spec's only open core
semantic (conformance **R-3**, editor **OP-ROT-2**), tilted layout-visible,
to be decided by measurement, not argument (triage #5).

**Method.** Both semantics implemented behind one flag
([`RotationInFlow`](../lab/src/resolve.rs)) in the same resolver — nothing
else differs (guarded by the `flag_scope_is_limited_to_flow_rotation`
test). The triage-#27 scene — three 60×100 cards in a hug row (gap 10,
pad 10), middle card rotated — swept θ = 0…360° in 2° steps under both
modes, plus a fixed-width-container variant. Every step applied through
the op layer, asserting rotation stays a **1-field write** in flow.

**Artifacts.**

- [`metrics.csv`](./metrics.csv) — per-frame container width, sibling
  position, peak sibling AABB overlap, per-step displacement.
- [`frames/theta_*.svg`](./frames) — side-by-side snapshots (anchor arm
  above, visual-only control below, magenta dashed = world AABBs).
- [`demo.html`](./demo.html) — interactive scrubber + play button over the
  precomputed frames; open in any browser to _feel_ both arms.
- Driver: [`../lab/src/bin/e1.rs`](../lab/src/bin/e1.rs)
  (`cargo run --bin e1` from `../lab`).

**Measured** (sweep summary, reproduced by the driver):

| metric                      | anchor (AABB participates)                               | visual-only control                 |
| --------------------------- | -------------------------------------------------------- | ----------------------------------- |
| sibling overlap, any θ      | **0 px², always**                                        | up to **1830 px²** (≈31% of a card) |
| container (hug)             | breathes 220 → 276.6 px (peak at θ\*≈59°)                | frozen at 220 px                    |
| sibling displacement per 2° | ≤ 3.45 px, smooth (analytic bound √(w²+h²)·Δθ = 4.07 px) | 0                                   |
| envelope peak               | θ\* = atan(h/w) ≈ 59°, **not** 90°                       | n/a                                 |
| rotate gesture              | 1 field write                                            | 1 field write                       |

The verdict lives in [`verdict.md`](./verdict.md).
