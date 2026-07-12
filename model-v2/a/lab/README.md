# anchor-lab

The standalone proving crate for the `anchor` model
([`../../models/a.md`](../../models/a.md)) — lab subset: `frame`, `shape`
(rect/ellipse/line/path), `text` (oracle-backed, with a deterministic 0.6/1.2
stub), `group`, `lens` (2D ops). **Not** a member of the repo workspace;
promotion into `crates/` happens at phase 4 only.

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
  intrinsic passes); stores one final-width text-layout artifact per text node
- `src/text_layout.rs` — backend-independent line/glyph artifact and
  `TextLayoutOracle`; the compatibility `resolve` path uses the explicitly
  named glyphless stub, while an engine injects its shaping implementation
- `src/path.rs` — strict SVG path-data analysis, bounded rational-conic arc
  lowering, tight unit bounds, and one resolved box-mapped path artifact
- `src/ops.rs` — gesture ops with typed errors + write-count doctrine
- `src/textir.rs` — the agent text IR parser + canonical printer (E3)
- `src/grida_xml.rs` — strict Draft 0 `.grida.xml` parser/writer boundary
- `src/grida_xml_source.rs` — pure retained Version 1/2/3 source-program
  linker, typed scalar specializer, named static slot projector, and
  ordinary-scene materializer; hosts supply immutable dependency snapshots
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
`<ellipse>`, `<line>`, and unit-reference `<path>` primitives, `width`/`height`,
`min-width`/`max-width`/`min-height`/`max-height`, and `aspect-ratio`.
`<shape>` is reserved and `kind` is not a render-node attribute. Historical
`<frame>`, `<shape kind="…">`, `w`/`h`, `min-w`/`max-w`/`min-h`/`max-h`, and
`aspect` remain available only through the unwrapped `textir` surface; direct
primitive tags are not accepted there.
The proof parser also requires non-negative `grow`, `gap`, and `padding`;
historical `textir` retains its experiment-era numeric behavior.

Grida XML text uses canonical `font-size`, numeric `font-weight`, and
`font-style="normal|italic"`; historical TextIr alone keeps `size`. Direct,
flat `<tspan>` children lower to the production-shaped UTF-8
`AttributedString` model and never become scene nodes. Omitted run fills fall
back to the text node's ordered paints, while `fill="#…"` and one literal-first
structured `<fill>` preserve explicit run overrides, including rich paint
stacks and explicit emptiness. The deterministic stub metric is run-aware for
font size; weight and italic remain metric-neutral but survive into paint. Run
strokes stay rejected until their single production geometry can reconcile
with Draft 0's repeatable stroke topology.

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

A boxed `<rect>`, `<ellipse>`, `<line>`, or `<path>` may own free-positioned
children in its local box. This is composition only: it gains no flex
attributes, descendants do not feed back into the primitive's declared box or
parent layout contribution, and `<text>` remains a leaf. A path's complete SVG
`d` grammar is validated against fixed `0 0 1 1` realized geometry, then
mapped once into the final box; that resolved command artifact supplies bounds
and rendering without reparsing or independently rescaling geometry.
Filesystem I/O, resources, and rasterization remain host concerns.

## Retained Version 1/2/3 source programs

`grida_xml_source` is a separate source-level boundary above Draft 0. It
retains immutable source snapshots, resolves Version 1 `component`/`use`
references through a host-supplied pure provider, rejects expansion cycles,
implements Version 2's closed typed scalar prop/argument model, and adds
Version 3 named static render-slot projection. Assignments splice at their
definition-owned marker in caller order; absent assignments erase the marker.
There is no default slot, fallback, requiredness, wrapper, or render-model slot
node.

It materializes one ordinary component-blind `Document`. The outcome also
contains per-node source/use provenance, specialization selection/origin
provenance, one slot-projection provenance record per declared slot per use
(including empty projections), and a resource manifest whose opaque runtime
RIDs distinguish equal relative image strings from different source origins.
Assigned trees retain their caller source, scalar scope, resource base, and
authored-node provenance. Projection failures retain the innermost slot and
assignment sites in addition to the complete use chain. The module performs no
file or image I/O.

Version 3 may link Version 1, 2, or 3 components, but render assignments are
accepted only by Version 3 targets. Version 1/2 callers cannot link Version 3
definitions. These compatibility checks happen at the source-program boundary
without reinterpreting an older source grammar.

This does not broaden `grida_xml::parse`, change `grida_xml::VERSION`, add
component variants to the node model, or make materialized copies canonical
source. Draft 0 passed through this higher source-program boundary receives
the same origin-aware runtime image rekeying; direct `grida_xml::parse` and
`print` retain their exact Draft 0 contract.

The current operation links only the closure reachable from an entry scene.
It does not yet accept an explicitly requested component export as a root or
perform complete-library validation from every export. Source-local validation
searches at most 4,096 declared-domain witness states per parameterized
component and fails explicitly at that bound. Retaining exact source snapshots
provides source-preserving access, but this module does not yet provide
same-location, canonical source-unit, or canonical multi-file writer modes. It
therefore makes no canonical-writing claim. Draft 0 parse errors are currently
string-only, so a specialization failure retains the complete candidate
binding set for its failing specialization or projected subtree rather than a
minimal causal subset.

Known lab simplifications (declared in the REPORT's lose column):
children as ordered `Vec` (no fractional index), per-container Taffy
trees (engine uses one tree), no incremental invalidation, no
tray/image/embed/vector/bool payloads.
