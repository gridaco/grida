# E4 verdict — resolver architecture

**Decision: the four-phase resolver is viable as the phase-4
architecture — it is simpler than what it replaces, its costs are
in-budget unoptimized, and its structure gives locality for free.**
Plus two dependency findings that phase 4 must carry.

## vs `cache/geometry.rs` (the branch forest)

What the lab resolver structurally _does not contain_, because the model
made the cases unrepresentable:

| current pipeline (`crates/grida`)                                                                                                                                 | lab resolver                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `resolve_layout` (geometry.rs:754): per-kind branch forest — 26 `match`/`if let` arms reconciling three geometry models                                           | one uniform header path + a 3-way box-source split (declared / measured / derived)                                                   |
| `AffineTransform::new(l.x, l.y, geo.schema_transform.rotation())` (geometry.rs:823 …): rebuilds leaf transforms through `atan2`, destroying scale/skew (X-SELF-2) | no matrix in the document to destroy; `from_box_center` is _the_ constructor (Phase T) — no `atan2` anywhere in steady state         |
| `NodeGeoData` carries `schema_transform` **and** a separate rotation — two truths to keep coherent                                                                | the resolved tier holds resolved values only; intent lives in the document                                                           |
| `MIN_SIZE_DIRTY_HACK = 1.0` px floors (geometry.rs:812–869) patching text/markdown zero-size cases                                                                | G-E5's declared rule; zero-size resolves as zero, reported — no floors (the hack is a sentinel workaround the model no longer needs) |
| ICB special regime (root children's transforms ignored)                                                                                                           | root is an ordinary viewport-bound frame (X-SELF-5 break, tested)                                                                    |

That 26-arm forest is not "bad code" — it is the _interest payment_ on
three coexisting geometry models. The spike's point is that the payment
stops when the model unifies: the whole lab resolver is ~700 lines
including the E1 fork, reports, and both derived-box semantics.

## Performance posture

10k free nodes in 5.4 ms and the all-flex worst case at 24 ms —
single-threaded, zero caching, double-running Taffy on hug containers —
comfortably clears interactive budgets before any of the production
engine's machinery (single Taffy tree, damage tracking, parallelism) is
applied. Phase 4 carries over `layout/engine.rs`'s single-tree build and
adds the anchor semantics on top; nothing measured here suggests the
model itself adds cost — the AABB contribution for rotated-in-flow
children is two `abs`-weighted products per child (`mixed` scene: 1,218
nodes/ms _with_ rotated flow children on the hot path).

## Dependency findings (Taffy 0.9.2) — carried to phase 4

1. **Rounding default**: Taffy pixel-snaps unless `disable_rounding()` is
   called. L-7 declares resolution unquantized (snapping is paint's job)
   — the engine must disable rounding or L-7 drifts silently.
2. **Intrinsic-pass grow inflation**: in the max-content sizing pass a
   _growable_ item's contribution is floored by the container's own
   padding (`.max(main_content_box_inset)`, flexbox.rs — the source
   comments admit trial-and-error provenance). Symptom: hug column with
   `padding:16` + a growable one-line text hugs to 112 instead of 99.2 —
   deviating from both L-3 ("grow distributes only definite free space")
   and Chromium. Lab enforcement: strip grow factors in indefinite-main
   intrinsic runs; the definite re-run applies them. Phase 4 needs the
   same guard (or an upstream Taffy fix) — and L-3 needs a conformance
   test pinned against Chromium, not against Taffy.

## Spec consequences

- N-4 (linear scaling, bounded invalidation) — evidenced; the phase-order
  acyclicity note in §6 should be promoted from an implementation remark
  to a normative invariant, since locality _derives_ from it.
- The two-pass hug (intrinsic then definite) is inherent to
  hug-with-layout in any engine; single-tree Taffy hides it inside one
  `compute_layout`. No model change needed.
