# Conformance & test corpus — model-agnostic

What the winning model must be tested against — **regardless of which model
wins**. Every entry is phrased against the observable surface only: a
document in the winner's format, resolved geometry via a query API
(world transform, box, bounds per node), rendered pixels, and mutation
results. No entry may reference model internals.

Where the two finalists ([`finale.md`](./finale.md)) _must_ answer
differently by design, the entry is marked **FORK** and carries two expected
columns — the fork rows are the executable form of the finale's deciding
question.

## Verdict taxonomy

| tag     | meaning                                                                                                               | reported as                                      |
| ------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `INV`   | invariant — must hold exactly                                                                                         | **Y/N**                                          |
| `POL`   | either behavior is acceptable, but the model must **declare one and never drift**; the test locks the declared answer | Y/N against the declaration                      |
| `SPC`   | graded parity against an external oracle                                                                              | **spectrum** (% of case matrix within tolerance) |
| `FORK`  | finalists diverge by design; two expected columns                                                                     | Y/N per finalist                                 |
| `DEFER` | spec'd now, enforced when the feature lands (animation, wire)                                                         | —                                                |

## Oracles

- **Chromium** — flex/CSS-family semantics. The bake methodology already
  exists in-house (`htmlcss` parity loops); reuse it for layout `SPC` suites.
- **Figma** — canvas-family semantics, via `.fig` import fixtures
  (io-figma corpus) and behavior tables captured from the product.
- **SVG (resvg + Chromium)** — transform/vector import semantics.
- **Self** — goldens, round-trips, determinism, and **metamorphic laws**
  (algebraic invariants needing no external oracle — the strongest tier).

---

## 1. Metamorphic laws (`MM-*`) — hold for any model

The cheapest, most powerful tier: properties over _pairs_ of documents.

| id   | law                                                                                                                                            | tag |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| MM-1 | Translate a parent by (dx,dy) → every descendant's world transform translates by exactly (dx,dy); nothing else changes                         | INV |
| MM-2 | rotate(θ) then rotate(−θ) restores the identical resolved geometry                                                                             | INV |
| MM-3 | Resolved geometry is a pure function: same document + same fonts/resources + same viewport → identical output, run-to-run                      | INV |
| MM-4 | Viewport size affects only the viewport-bound root's subtree sizing paths; a free node's geometry is viewport-independent                      | INV |
| MM-5 | Order of writes to _independent_ fields commutes (set A then B ≡ set B then A)                                                                 | INV |
| MM-6 | Hidden (`active:false`) children do not affect any sibling's or ancestor's resolved geometry — except derived-box parents, per declared policy | POL |
| MM-7 | Adding then deleting a node restores prior resolved geometry byte-for-byte                                                                     | INV |
| MM-8 | Zoom/camera is renderer state: no resolved-geometry query changes under camera motion                                                          | INV |
| MM-9 | Deep-nesting associativity: reparenting A→B→C as A→C with composed local placement preserves world transforms within tolerance N-3             | INV |

## 2. Geometry resolution (`G-*`)

Position/size resolution across the full authoring vocabulary.

**Matrix**: every position mode (per axis: start/end/center offsets; both-edge
span/insets) × every size mode (fixed/auto/fill-equivalent) × context
(free / in-flow / absolute-in-flex).

| id        | case                                                                                                                                                                      | tag                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| G-1       | x/left offset resolves against parent box start; end/right against end; center against center — exact arithmetic per spec table                                           | INV                                                                                                                    |
| G-2       | End-anchored intent survives parent resize: "right: 24" re-resolves to keep 24 after parent width change                                                                  | **FORK** — `anchor`: Y (stored intent); `sheet`: Y (inset property) — both Y here; kept as guard                       |
| G-3       | Over-constraint (left+width+right all expressed)                                                                                                                          | **FORK** — `anchor`: unrepresentable / typed error; `sheet`: declared precedence, loser dormant. POL-locked per winner |
| G-4       | min/max clamp applied after size resolution, before drawing; min > max → declared rule                                                                                    | POL                                                                                                                    |
| G-5       | aspect-ratio resolves the under-specified axis only; never overrides explicit; never violates min/max                                                                     | INV                                                                                                                    |
| G-6       | Percentage bases (if supported): declared reference box, exact                                                                                                            | POL                                                                                                                    |
| **edges** |                                                                                                                                                                           |                                                                                                                        |
| G-E1      | Zero-size parent: children with end/center anchors and percentage sizes — no NaN, declared results                                                                        | INV                                                                                                                    |
| G-E2      | Negative resolved size (span offsets exceeding parent): declared rule (clamp-to-zero / flip) — never a negative-width box downstream                                      | POL                                                                                                                    |
| G-E3      | Auto size on a kind with no natural size (pure shape): declared error-or-default; never silent 0-vs-unset ambiguity                                                       | POL                                                                                                                    |
| G-E4      | Content-origin offset: a path whose tight bounds start at (4,10) — box, bounds, and hit-test agree on the offset (today's `content_origin` cases)                         | INV                                                                                                                    |
| G-E5      | Line-like degenerate (height locked 0): layout, bounds, hit width behave; no MIN_SIZE-style hack observable (replaces today's `MIN_SIZE_DIRTY_HACK` with a declared rule) | POL                                                                                                                    |

## 3. Rotation & transform (`R-*`)

| id        | case                                                                                                                              | tag                                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --- | ------ | ------------------------------ | --- |
| R-1       | Pivot: rotating a boxed node preserves its box center in parent space (center pivot), or the declared pivot exactly               | POL (locked to winner's spec)                                                                                                              |
| R-2       | Rotated AABB arithmetic: world AABB = exact `                                                                                     | w·cosθ                                                                                                                                     | +   | h·sinθ | ` envelope of the oriented box | INV |
| R-3       | **Rotation × layout participation**: rotated child inside a flex row                                                              | **FORK** — `anchor`: siblings make room for the rotated AABB; `sheet`: siblings do not move; overlap is correct. THE deciding-question row |
| R-4       | Rotation and resize commute visually per declared pivot: resize-then-rotate ≡ rotate-then-resize for center pivot                 | INV (if center pivot)                                                                                                                      |
| R-5       | Composition depth: 50-deep rotated nesting — world transform matches closed-form composition within N-3 tolerance                 | INV                                                                                                                                        |
| R-6       | Exceptional transforms (skew / matrix / 3D — via quarantine node or transform property per winner): parity vs SVG/Chromium oracle | SPC                                                                                                                                        |
| **edges** |                                                                                                                                   |                                                                                                                                            |
| R-E1      | θ ∈ {0, 90, 180, 270, 360, −90, 0.001, 1e−6}: exact expected matrices (90° multiples bit-clean, no drift)                         | INV                                                                                                                                        |
| R-E2      | θ = 720 (winding): stored/reported as authored where the model represents it; interpolation midpoint 0→720 at t=.5 is 360         | DEFER-ANIM                                                                                                                                 |
| R-E3      | NaN/Inf/−0.0 rotation rejected at the write boundary with typed error; never enters the document                                  | INV                                                                                                                                        |
| R-E4      | Accumulation: 360 × 1° successive rotations vs one 360° — divergence bounded by declared tolerance                                | INV                                                                                                                                        |
| R-E5      | Flip/mirror content (negative-determinant transforms, e.g. Figma import): declared representation; round-trips through the format | POL                                                                                                                                        |

## 4. Layout / flex (`L-*`) — mostly SPC vs Chromium

**Matrix**: direction × wrap × main-align × cross-align × gap × padding ×
child size modes × grow — baked against Chromium, scored as spectrum.

| id        | case                                                                                                                                                                                 | tag            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| L-1       | Core flex matrix parity                                                                                                                                                              | SPC (Chromium) |
| L-2       | **Declared deviation**: default `flex-shrink = 0` (Grida) vs `1` (CSS) — canvas items don't shrink implicitly. Test locks _our_ declared behavior, and the deviation is listed in §9 | POL            |
| L-3       | Hug (auto) container sizing with mixed fixed/grow children — no cycle; grow distributes only definite free space                                                                     | INV            |
| L-4       | Absolute child inside a flex parent: excluded from flow, resolves against parent box                                                                                                 | INV            |
| L-5       | Measured child (text) re-measures at layout-imposed width; final geometry = re-wrapped height                                                                                        | INV            |
| L-6       | Nested flex (row-in-column-in-row, 3 deep) parity                                                                                                                                    | SPC            |
| L-7       | Rounding/pixel-snapping: declared policy (none / half-up at paint only); resolution itself unquantized                                                                               | POL            |
| **edges** |                                                                                                                                                                                      |                |
| L-E1      | Empty container with padding + hug: size = padding box                                                                                                                               | INV            |
| L-E2      | Zero-size and hidden children in flow: gap contribution declared                                                                                                                     | POL            |
| L-E3      | Overflow (children exceed fixed parent): no shrink (per L-2), overflow geometry exact; clip flag affects paint only, never geometry                                                  | INV            |
| L-E4      | grow with zero free space / negative free space: no shrink below basis (per L-2)                                                                                                     | INV            |
| L-E5      | min/max + grow + aspect-ratio simultaneously: resolution order declared and stable                                                                                                   | POL            |

## 5. Measured content (`T-*`)

| id        | case                                                                                                                                                                                                        | tag                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| T-1       | Fixed-width text wraps; auto-width text measures single-line max; height auto = measured height                                                                                                             | INV                            |
| T-2       | `max_lines`/`ellipsis` alter _paint and reported natural size_ per declared rule — and "unset vs 0" is structurally distinct (today's `max_lines: Some(0) ≡ None` fbs-default hack must be unrepresentable) | INV (sentinel-freedom witness) |
| T-3       | Same document + same font set → identical measured geometry across runs and platforms within N-3                                                                                                            | INV                            |
| T-4       | Missing font: declared fallback chain; geometry deterministic under the fallback; a document must not silently change when a font later appears — declared staleness policy                                 | POL                            |
| T-5       | Vector/network bounds as box source: editing a vertex updates box, bindings re-resolve against the new box                                                                                                  | INV                            |
| **edges** |                                                                                                                                                                                                             |                                |
| T-E1      | Empty string, whitespace-only, single glyph taller than line-height, BiDi/RTL text runs (text-internal only — the canvas has no RTL layout axis, declared)                                                  | POL                            |
| T-E2      | Text with height smaller than one line + vertical alignment: clip positioning per the documented top/center/bottom offset math                                                                              | INV                            |
| T-E3      | Ellipsis override semantics: unset → "…", empty string → no ellipsis — structurally distinct states                                                                                                         | INV                            |

## 6. Derived boxes: groups & booleans (`D-*`)

| id        | case                                                                                                                       | tag                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| D-1       | Group bounds = union of children's **oriented** corners (not AABB-of-AABBs)                                                | INV                                                                                     |
| D-2       | **Sibling stability**: editing child A of a rotated group does not move child B in world space                             | INV — the P6 instability test                                                           |
| D-3       | Child edits never require a write to the group node (observable via document diff)                                         | **FORK-ish** — `anchor`: Y; `sheet`: Y; (`bake` failed this — kept as regression guard) |
| D-4       | Ungroup bakes: children's world transforms preserved within N-3                                                            | INV                                                                                     |
| D-5       | Boolean bounds = bounds of the op _result_ (subtract-to-empty → declared empty-bounds behavior; hit-test and render agree) | POL                                                                                     |
| D-6       | Group participation in parent flex: declared (as its derived AABB, or excluded)                                            | POL                                                                                     |
| **edges** |                                                                                                                            |                                                                                         |
| D-E1      | Empty group / group of hidden children: bounds, render, hit — declared triple                                              | POL                                                                                     |
| D-E2      | Nested groups 10 deep with rotations: D-1/D-2 still hold; perf smoke                                                       | INV                                                                                     |
| D-E3      | Boolean of booleans; boolean containing a group: declared operand semantics                                                | POL                                                                                     |

## 7. Mutation & document validity (`M-*`) — the editor-IR suite

| id  | case                                                                                                                                                                                                | tag                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| M-1 | **Sentinel-freedom sweep**: for every field, "unset" is structurally distinct from every legal value (enumerated per field; the current `max_lines=0`, `(0,0)-aspect-ratio` class must fail-closed) | INV                                                                                                                                  |
| M-2 | **Set-means-set**: after any accepted write, effectiveness is decidable from the node + declared discriminants (+ parent context); locked list of typed-error writes                                | **FORK** — `anchor`: model-level; `sheet`: editor-level discipline, model permits — test targets the _editor write path_ under sheet |
| M-3 | Switch-memory: mode toggle A→B→A restores retained inactive values (if flattening (b) adopted)                                                                                                      | POL                                                                                                                                  |
| M-4 | Unknown node kind / unknown field in a newer document: reader skips or errors per declared forward-compat rule, and **preserves unknown content through a read-modify-write round-trip**            | INV                                                                                                                                  |
| M-5 | Reparent (no geometry fields touched): declared world-position semantics (preserve-world vs preserve-local), locked                                                                                 | POL                                                                                                                                  |
| M-6 | Every mutation rejected with a typed error leaves the document byte-identical                                                                                                                       | INV                                                                                                                                  |

## 8. Serialization & round-trip (`S-*`)

| id  | case                                                                                                                                                                               | tag                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| S-1 | decode → encode → decode fixpoint (bytes or canonical-form equality, declared)                                                                                                     | INV                  |
| S-2 | f32 fields survive bit-exact through the format                                                                                                                                    | INV                  |
| S-3 | _Derivable ⇒ not encodable_ (if `anchor` wins): the format cannot express resolved boxes outside a marked cache section; caches carry a validity stamp and staleness is detectable | INV / POL per winner |
| S-4 | Fractional-index sibling order: stable sort, duplicate/empty position strings → declared tiebreak                                                                                  | POL                  |
| S-5 | Cross-boundary codec: Rust-encode → TS-decode equivalence on the full corpus (existing io practice, promoted to a gate)                                                            | INV                  |

## 9. Concurrency / merge atoms (`C-*`) — executable H3 matrix

Merged documents must **always be valid** (INV); intent survival is scored.

| id  | concurrent pair                                        | valid?       | intent survival                                 |
| --- | ------------------------------------------------------ | ------------ | ----------------------------------------------- |
| C-1 | move ∥ rotate (same node)                              | INV Y        | both survive — Y expected under either finalist |
| C-2 | resize ∥ rotate                                        | INV Y        | both survive                                    |
| C-3 | move ∥ reparent                                        | INV Y        | declared (POL)                                  |
| C-4 | child-edit ∥ group-rotate                              | INV Y        | both survive (D-3 corollary)                    |
| C-5 | half-a-drag (x from A, y from B)                       | INV Y        | valid-but-compound-lost — documented, accepted  |
| C-6 | span/inset pair halves (start from A, end from B)      | INV Y        | same class as C-5                               |
| C-7 | mode-switch ∥ retained-field write (flattening (b))    | INV Y        | declared dominance                              |
| C-8 | wire-cycle creation (two acyclic edits merging cyclic) | DEFER (wire) | deterministic break rule per d.md               |

## 10. Numerical robustness (`N-*`)

| id  | case                                                                                                                                                                  | tag |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| N-1 | Coordinates at ±1e7 (far-canvas): geometry error bounded; no catastrophic cancellation in world composition                                                           | INV |
| N-2 | NaN/Inf/subnormal inputs rejected at every write boundary — the document is NaN-free by construction                                                                  | INV |
| N-3 | **Tolerance policy (normative)**: bit-exact within a platform; declared ε for cross-platform (native vs wasm) world-space comparisons — every INV above inherits this | POL |
| N-4 | 10k-node resolution: cost scales ~linearly; editing one leaf invalidates a bounded set (locality smoke — deep perf stays with the render-perf discipline)             | SPC |

---

## 11. Compatibility checklist (`X-*`) — reproduce, deviate, or defer

Each row: **Y** (we reproduce), **N** (deliberate deviation, rationale
required), **SPC** (graded parity), **DEFER**.

### vs CSS / Chromium (`X-CSS-*`)

| id      | behavior                                             | verdict                                                                                          |
| ------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| X-CSS-1 | Flex core algorithm (basis/grow/align/gap/wrap)      | SPC — target ≥ high-90s% on the L-1 matrix                                                       |
| X-CSS-2 | `flex-shrink: 1` default                             | **N** — Grida defaults 0; canvas items keep authored size (already today's deliberate deviation) |
| X-CSS-3 | min-/max-content intrinsic sizing keywords           | DEFER                                                                                            |
| X-CSS-4 | Margins                                              | **N** — gap + padding only; margin is not in the model                                           |
| X-CSS-5 | Post-layout transforms (rotated flow child overlaps) | **FORK** — `sheet`: Y; `anchor`: N by design for base rotation (lens/motion lane only)           |
| X-CSS-6 | Specified-vs-computed two-tier reads                 | Y (both finalists, different mechanisms)                                                         |
| X-CSS-7 | Writing modes / RTL block axes                       | **N** — the canvas has no RTL layout axis (text-internal BiDi only, T-E1)                        |
| X-CSS-8 | CSS Anchor Positioning                               | DEFER — the `wire`/Level-4 future under either finalist                                          |
| X-CSS-9 | Baseline alignment in flex                           | DEFER                                                                                            |

### vs Figma (`X-FIG-*`)

| id      | behavior                                                          | verdict                                                      |
| ------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| X-FIG-1 | Rotated child's AABB participates in auto-layout                  | **FORK** — `anchor`: Y; `sheet`: N (structurally impossible) |
| X-FIG-2 | Constraints Min/Max/Center/Stretch re-derive on parent resize     | Y (mapping table per winner's vocabulary)                    |
| X-FIG-3 | Scale constraint (proportional)                                   | DEFER                                                        |
| X-FIG-4 | Group re-fit + compensation writes on child edit                  | **N** — derived bounds instead (D-2/D-3 are the tests)       |
| X-FIG-5 | Center-pivot rotation _gesture_                                   | Y (gesture-level under any storage)                          |
| X-FIG-6 | `.fig` import corpus renders within tolerance (io-figma fixtures) | SPC                                                          |
| X-FIG-7 | Hug/fixed toggle restores prior value (switch memory)             | Y via M-3                                                    |

### vs SVG (`X-SVG-*`)

| id      | behavior                                                 | verdict                                                                                                   |
| ------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| X-SVG-1 | translate/rotate/scale transform lists import losslessly | Y                                                                                                         |
| X-SVG-2 | skew / arbitrary `matrix()` import                       | Y-with-structure (lens wrap under `anchor`; transform property under `sheet`) — never silent loss (T1/H8) |
| X-SVG-3 | `x/y` attr + `translate()` double-translation            | Y — defined single mapping                                                                                |
| X-SVG-4 | viewBox / preserveAspectRatio                            | SPC (import corpus)                                                                                       |
| X-SVG-5 | `<g transform>` ↔ group semantics                        | Y                                                                                                         |
| X-SVG-6 | 3D (`matrix3d`-class content)                            | `anchor`: lens vocabulary (DEFER impl); `sheet`: transform prop (DEFER impl)                              |

### vs current Grida engine (`X-SELF-*`) — migration honesty

For each existing observable behavior: **keep** or **break** (with migration
note). Breaks are features here — they are the flaws this redesign exists
to fix, and each needs a regression-direction test proving the _new_
behavior.

| id       | current behavior                                                             | verdict                                                             |
| -------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| X-SELF-1 | Rotation pivots at local top-left (`T·R`)                                    | **break** → declared pivot (R-1); migration converts stored values  |
| X-SELF-2 | Layout path destroys leaf scale/skew (`new(x,y,rotation())`)                 | **break** → structurally impossible (S-3 / model shape)             |
| X-SELF-3 | `MIN_SIZE_DIRTY_HACK` (1px floors in text/markdown resolution)               | **break** → declared rule (G-E5)                                    |
| X-SELF-4 | `max_lines: 0 ≡ unset`, `(0,0) ≡ no aspect-ratio` sentinels                  | **break** → M-1                                                     |
| X-SELF-5 | ICB children's transforms ignored (special regime)                           | **break** → regularized root (MM-4 covers)                          |
| X-SELF-6 | Group bounds via oriented-corner union                                       | **keep** (D-1)                                                      |
| X-SELF-7 | Render-bounds inflation (stroke align + effects) separate from layout bounds | **keep** — inflation affects render bounds only, never layout (INV) |
| X-SELF-8 | Flex `flex-shrink: 0` default                                                | **keep** (X-CSS-2)                                                  |
| X-SELF-9 | Fractional-index sibling ordering                                            | **keep** (S-4)                                                      |

---

## 12. Corpus mechanics (brief)

- **Tiers**: (1) metamorphic + INV unit tests in Rust (`cargo test -p grida`);
  (2) resolved-geometry goldens (document → JSON of world transforms/boxes);
  (3) render reftests per the render-reftest discipline (oracle choice per
  suite); (4) oracle bakes (Chromium/Figma/SVG) producing the SPC scores.
- **IDs are stable** and referenced from the phase-3 spec (`covered_by`
  links, per the repo's test-tracking practice). A spec clause without a
  covering test ID is a spec bug.
- **FORK rows** double as the finale's §Decision-procedure probes: run them
  first; they are few and they are the decision.
- Every `POL` row's declared answer gets recorded in the winner's spec at
  phase 3 — a `POL` test failing later means drift, which is exactly what
  it exists to catch.
