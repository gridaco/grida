# E4 — resolver spike

**Question.** Does the four-phase resolution (measure → layout →
transforms → bounds, models/a.md §6) hold up as an engine architecture —
throughput, scaling, invalidation shape — against the current
`crates/grida` pipeline (`cache/geometry.rs` + `layout/engine.rs`)?

**Method.** The lab resolver ([`../lab/src/resolve.rs`](../lab/src/resolve.rs))
is a faithful §6 implementation over Taffy 0.9 (the engine's own layout
crate, same version). [`../lab/src/bin/e4.rs`](../lab/src/bin/e4.rs)
benches full resolution on three scene shapes at 1k/10k nodes
(median of 11, release, single-threaded, M-series laptop).

## Measured (2026-07-07)

| scene                                                 | nodes  | full resolve | throughput     |
| ----------------------------------------------------- | ------ | ------------ | -------------- |
| flat canvas (free shapes, ⅐ rotated)                  | 1,001  | 1.05 ms      | 952 nodes/ms   |
| flat canvas                                           | 10,001 | 5.42 ms      | 1,844 nodes/ms |
| flex cards (nested hug column-in-row, text measure)   | 577    | 2.55 ms      | 226 nodes/ms   |
| flex cards                                            | 5,785  | 24.4 ms      | 237 nodes/ms   |
| mixed groups + flex (rotated-in-flow on the hot path) | 10,003 | 8.21 ms      | 1,218 nodes/ms |
| single card subtree (locality bound)                  | 6      | **18 µs**    | —              |

- **N-4 linearity holds**: 10× nodes → 5.2×–9.6× time across shapes
  (sub-linear on flat scenes from cache warmth; the all-flex worst case
  is cleanly linear).
- **Locality**: a leaf edit under clean parent boxes re-resolves one
  container subtree — measured 18 µs per card. The one-way phase order
  (measure never reads position; contributions never read assigned
  position) is what makes "clean parent ⇒ subtree-local" a _structural_
  guarantee rather than a cache heuristic.
- Flex-heavy costs ~5–8× per node vs free placement. Two known lab
  inefficiencies inflate it: hug containers run Taffy twice (intrinsic +
  definite pass), and each container builds a fresh `TaffyTree`. The
  production engine's single-tree build (`layout/engine.rs`) removes
  both; treat 237 nodes/ms as the floor, not the ceiling.

The architecture comparison and dependency findings are in
[`verdict.md`](./verdict.md).
