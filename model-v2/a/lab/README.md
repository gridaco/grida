# anchor-lab

The standalone proving crate for the `anchor` model
([`../../models/a.md`](../../models/a.md)) — lab subset: `frame`, `shape`
(rect/ellipse/line), `text` (deterministic 0.6/1.2 metric), `group`,
`lens` (2D ops). **Not** a member of the repo workspace; promotion into
`crates/` happens at phase 4 only.

```sh
cargo test                      # conformance + format-contract suites
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
- `src/grida_xml.rs` — strict Draft 0 `.grida.xml` parser/writer boundary
- `src/svgout.rs` — SVG snapshots of resolved documents
- `src/math.rs` / `src/measure.rs` — affine + deterministic text metric
- `tests/` — the conformance-derived suites; `tests/common/mod.rs` helpers

## Draft 0 `.grida.xml`

`grida_xml::parse(&str)` is a pure source boundary. It requires
`<grida version="0">` with exactly one authored `<container>` render root. The
envelope is not a node: parsing preserves the model's implicit
viewport-spanning document root and attaches the authored root below it.
`grida_xml::print(&Document)` is fallible and self-validating, so it cannot
silently omit root state, serialize a forest, or emit source the strict parser
rejects.

The reader and writer implement the current
[Grida XML Draft 0 RFD](https://grida.co/docs/wg/format/grida-xml) vocabulary.
Parsing is strict: retired experiment spellings, unknown properties, invalid
target/property combinations, and model states that cannot round-trip fail
with contextual errors instead of being ignored or repaired.

The proof subset has one node vocabulary: `<container>`, direct `<rect>`,
`<ellipse>`, and `<line>` primitives, `width`/`height`,
`min-width`/`max-width`/`min-height`/`max-height`, and `aspect-ratio`.
`<shape>` is reserved and `kind` is not a render-node attribute. Historical
`<frame>`, `<shape kind="…">`, `w`/`h`, `min-w`/`max-w`/`min-h`/`max-h`, and
`aspect` remain available only through the unwrapped `textir` surface; direct
primitive tags are not accepted there.
The proof parser also requires non-negative `grow`, `gap`, and `padding`;
historical `textir` retains its experiment-era numeric behavior.

Fill-bearing nodes carry one ordered `Paints` value matching the production
paint contract. `fill="#fff"` is the canonical ordinary singleton-solid form;
singular `<fill>` owns every richer stack and explicit emptiness. Typed
`<solid>`, `<gradient kind="linear|radial|sweep|diamond">`, and `<image>`
children are bottom-to-top painter order. Gradient stops remain structured;
image `src` remains a logical RID and parsing performs no path I/O. Per-paint
`visible`, `opacity`, and `blend-mode` lower directly to model state. Solid and
stop opacity intentionally quantize into RGBA8 alpha.

Paintable nodes also carry ordered `Vec<Stroke>` state. Each stroke owns its
own existing `Paints` plus width, alignment, cap, join, miter, and dash
geometry. Repeated strokes therefore remain independent and lossless; lines
are stroke-only and receive no implicit ink. Default-empty stroke state
normalizes to omission, while non-default empty geometry survives round-trip.
This `Vec<Stroke>` is the lab implementation of Draft 0's accepted model
extension. The production scene/archive model still needs the corresponding
multiplicity change before it can claim the same round-trip surface.

Historical E3 TextIr remains a separate singleton-opaque-solid dialect with no
stroke syntax.
`textir::try_print` reports richer state it cannot represent; the compatibility
`textir::print` wrapper never silently narrows that state.

A boxed `<rect>`, `<ellipse>`, or `<line>` may own free-positioned children in
its local box. This is composition only: it gains no flex attributes,
descendants do not feed back into the primitive's declared box or parent layout
contribution, and `<text>` remains a leaf. Filesystem I/O, resources, and
rasterization remain host concerns.

Known lab simplifications (declared in the REPORT's lose column):
children as ordered `Vec` (no fractional index), per-container Taffy
trees (engine uses one tree), no incremental invalidation, no
tray/image/embed/vector/bool payloads.
