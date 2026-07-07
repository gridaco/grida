# anchor-lab

The standalone proving crate for the `anchor` model
([`../../models/a.md`](../../models/a.md)) — lab subset: `frame`, `shape`
(rect/ellipse/line), `text` (deterministic 0.6/1.2 metric), `group`,
`lens` (2D ops). **Not** a member of the repo workspace; promotion into
`crates/` happens at phase 4 only.

```sh
cargo test                      # 56 conformance-derived tests (MM/G/R/L/T/D/M suites)
cargo run --bin e1              # E1 sweep → ../e1-rotation-in-flow/ artifacts
cargo run --bin e3 -- truth     # E3 ground truth lines
cargo run --bin e3 -- score f   # score a prediction file
cargo run --release --bin e4    # E4 resolver benchmarks
cargo run --release --bin e5scan -- <dirs>   # E5 SVG corpus scan
```

Map:

- `src/model.rs` — Header (AxisBinding / SizeIntent / rotation / flow),
  payloads, `DocBuilder`
- `src/resolve.rs` — the four-phase resolver (§6); `RotationInFlow` flag
  (E1); §8 `Report`s; Taffy 0.9 per-container runs with the two
  dependency guards (rounding off; grow stripped in indefinite-main
  intrinsic passes)
- `src/ops.rs` — gesture ops with typed errors + write-count doctrine
- `src/textir.rs` — the agent text IR parser + canonical printer (E3)
- `src/svgout.rs` — SVG snapshots of resolved documents
- `src/math.rs` / `src/measure.rs` — affine + deterministic text metric
- `tests/` — the conformance-derived suites; `tests/common/mod.rs` helpers

Known lab simplifications (declared in the REPORT's lose column):
children as ordered `Vec` (no fractional index), per-container Taffy
trees (engine uses one tree), no incremental invalidation, no
tray/image/embed/vector/bool payloads.
