# LIMITS — the ship-readiness census

2026-07-07. Every kind × mechanism either has a passing test, a declared
rule, or a **named** limitation — no silent unknowns. Sources: the lab
suite (**92 tests** after this census + the E-A14 flip arm), the edge demo sweeps, the
three-domain enumeration run (48 structured edges), and the pedantic
review. Legend: ✅ proven (lab test) · 🎬 demo'd (edge-cases page) ·
📜 declared, untested · 🔶 SPEC-SILENT (policy owed) · ⛔ known
limitation (not built / can't hold as stated).

> **DEC-0 second lock (2026-07-07): the default is VISUAL-ONLY** —
> in-flow rotation is paint; sizing is CSS-pure
> ([`dec0-visual-only.md`](./dec0-visual-only.md)). The rotation/flow
> punch-list items below (E-A11/E-A12, grow/stretch-on-derived, law-9
> qualifier) are CLOSED n/a under the new default; they remain accurate
> for the documented alternative arm.

## The kind × mechanism matrix

| kind   | box           | realization                       | rotation          | flip                             | in flow        | as parent   | quarantine | notes                           |
| ------ | ------------- | --------------------------------- | ----------------- | -------------------------------- | -------------- | ----------- | ---------- | ------------------------------- |
| frame  | ✅            | ✅ children/flex                  | ✅ rigid (🎬)     | 📜 (boxed path, F-1 class)       | ✅             | ✅          | —          |                                 |
| shape  | ✅            | ✅ parametric + free children     | ✅                | ✅ (F-1/2/4 + 🎬)                | ✅             | ✅          | —          | rect/ellipse/line only in lab   |
| text   | ✅            | ✅ flowed (lab metric)            | ✅ (🎬)           | 📜 mirrors uniformly (DEC-9 sub) | ✅             | n/a         | —          | real shaping = the big ⛔ below |
| vector | ⛔ not in lab | 📜 mapped (E-A9, write side open) | 📜                | 📜 flip bits, points untouched   | 📜             | n/a         | —          | B2 lock set before phase 3      |
| image  | ⛔ not in lab | 📜 fitted (engine ships BoxFit)   | 📜                | 📜 paint mirrors (DEC-9)         | 📜             | n/a         | —          | low risk: paint seam exists     |
| embed  | ⛔ not in lab | 📜 flowed                         | 📜                | 🔶                               | 📜             | n/a         | —          | the live-web valve (COMPAT)     |
| group  | ✅            | ✅ union (oriented)               | ✅ origin pivot   | ✅ origin pivot (F-3/F-6)        | ✅ (🎬)        | ✅          | —          | transparency fork → GROUP.md    |
| bool   | ⛔ not in lab | ⛔ op-result box unproven         | 🔶 pivot unstated | ⛔                               | 🔶             | 🔶 operands | —          | needs path ops in Phase M       |
| lens   | ✅            | ✅ ops (2D)                       | ✅                | 🔶 order vs ops                  | ✅ pre-ops box | ✅          | ✅         | 3D ops = encoding-reserved only |
| tray   | ⛔ not in lab | 📜 (≈frame, no clip/layout)       | 📜                | ⛔                               | 📜             | 📜          | —          | root-treatment open (a.md §12)  |

## Fixed during this census (bugs found by construction, now regression-locked)

1. **Span-fill text never re-wrapped** — `Span{0,0}` (the canonical fill)
   ignored as a wrap constraint → single-line fill text. Fixed in the
   resolver; `span_fill_text_rewraps` ✅.
2. **Nested derived unions swallowed the inner union offset** — a
   group-in-group's content landed 20px off (D-E2 violation). Fixed;
   `nested_group_union_offset_exact` ✅.
3. **Hug used the wrong pivot for rotated derived children**
   (center-concentric shortcut vs origin pivot). Fixed — hug now
   transforms each child's true local AABB; `hug_wraps_rotated_group_exactly` ✅.
4. **Ungroup bake was wrong for derived children** (center formula on an
   origin-pivot kind). Fixed with a per-kind bake;
   `ungroup_nested_group_preserves_world` ✅.
5. **−0.0 rotation passed the R-E3 guard** — now canonicalized at the
   boundary; `negative_zero_rotation_canonicalized` ✅.

### Closed after the census — the flip arm (E-A14, 2026-07-07)

The owner-raised cross-zero red flag forced flip from "decided, zero
code" to built: pivot-per-kind (B1) tested, `T·R·F` innermost declared

- tested, layout-invisibility proven, `resize_drag` re-target with
  out-and-back identity, `NegativeExtent` typed wall (a **missing guard
  found**: `set_width(−50)` was silently accepted before), flip-aware
  ungroup bake (σ conjugation), IR round-trip. 11 tests in
  [`lab/tests/flip.rs`](./lab/tests/flip.rs); the wall/slide/flip gesture
  policy is [`DECISIONS.md`](./DECISIONS.md) **DEC-9**.

## The blockers (decide-before-ship; none is quietly deferrable)

- **B-1 · Text determinism vs real shaping.** T-3 (INV: identical
  measured geometry cross-platform within ε) is **unsatisfiable under
  tolerance semantics** once real fonts arrive: wrap decisions are
  discrete — a 1-ULP advance difference flips a line count and jumps
  geometry by a full line-height no ε can absorb. Figma ships its own
  text stack for exactly this reason. Decision owed: pin a deterministic
  shaper (bit-exact policy) or re-scope T-3 to per-platform goldens.
  The lab's exact metric made E1–E4 evidence structurally blind to this.
- **B-2 · f32 at far-canvas.** ULP(1e7) = 1.0px, so N-1's "error bounded
  at ±1e7" cannot hold in a normative-f32 pipeline (Blink uses 1/64
  fixed-point; Figma accepts limited range). Decision owed: declared
  coordinate budget (e.g. ±1e6 @ 0.1px) or f64 resolved tier.
- **B-3 · min/max × measured re-wrap.** Free context clamps _without_
  re-measure (spec-faithful, peer-less: ⅔ of ink can leave the box);
  flex context re-measures via the layout engine. One node, two heights
  by parent mode. Both peers re-measure. Decision owed: clamp-then-
  re-measure as the uniform rule (amend "clamp last").
- **B-4 · E-A9 write side** (pedantic B2, unchanged): stationarity,
  ref-rect intent status, zero-extent axes, bounds operator ("network
  bounds" = vertex hull vs curve extrema vs control hull — undefined;
  SVG getBBox says tight-geometry, control points excluded).
- **B-5 · bool in Phase M.** Op-result bounds require render-grade path
  booleans inside _measure_ — an engine-architecture dependency (pathops
  in the resolver), unbuilt and unbudgeted. Plus the COMPAT fork:
  Figma reports operand-union bounds, D-5 says op-result.

## Policy owed (🔶 SPEC-SILENT, enumerated — the phase-3 punch list)

Rotation/flow: rotated×stretch & re-measure (E-A12) · grow×rotation
continuity (E-A11) · grow/stretch on derived kinds (silently inert
today; Figma's answer is rescale-children = K-bake) · law 9's
"never moves siblings" needs the free-context qualifier (in flow, a
union change legitimately reflows — Figma agrees) · min/max clamps
bound the box, never the envelope (declare).
Text: vertical alignment of clipped/overflowing content (T-E2 cites
math that doesn't exist) · auto-width basis in definite flex
(wraps-at-available vs Chromium's max-content — same deviation family
as the Taffy guards) · grow on the measured axis (spec example (c) is
currently a no-op and its annotation is wrong — fix the example) ·
`max_lines: 0` semantics + max*lines→natural-size rule · font_size
domain (reject ≤0) · whitespace-only non-monotonicity · giant-word ink
escapes the world AABB (hit/cull miss — declare ink-bounds ⊃ box).
Transform: ~~flip×rotation composition order~~ (CLOSED E-A14: `T·R·F`,
innermost, tested) · flip on text (Figma mirrors; DEC-9 sub-decision,
uniform recommended) · flip on lens (outside-ops vs inside-ops) ·
negative-determinant lens Matrix
= second home for mirror (extend the E-A8 lint) · winding read source
(rotation reads the stored scalar — it \_is* intent; resolves the law-7 /
R-E2 / H5 three-way) · "spec-reserved" 3D ops need a declared v1
runtime posture (render-skip + preserve ≠ silent drop) · singular
resolved matrices (CSS: not displayed — adopt?) · resolved-tier
overflow (finite doc → Inf via 2e38 sizes; N-2 guards writes only —
adopt Blink-style saturation?) · lens op origin's reference rect +
nested lens pre/post visibility · lens read tier (xywh = pre-ops box;
declare the post-ops envelope as a second named read) · NaN via lens op
params (op-layer guard must cover every op scalar).
Derived: empty-derived placement (box snaps to origin — declare
placeholder-at-pins) · empty group in flex spends two gaps (CSS agrees;
declare) · MM-6's "declared policy" for hidden children of derived
parents (write it: skipped from union).

## Not built (the honest ⛔ ledger)

`bool` (needs pathops), `vector` (E-A9 lock first), `image`/`embed`/
`tray` payloads, ~~`flip_x/flip_y`~~ (BUILT — E-A14, 11 tests; only the
gesture policy DEC-9 is open), 3D lens ops (encoding reserved only), grid mode,
attributed text runs, `max_lines`/`ellipsis` fields, percent pins,
anchor-to-node (`wire`), incremental invalidator, real text shaper,
stable IR ids. Each is _named_ in a.md §12, the REPORT lose column, or
this census — nothing in this list is silent.

## Cost note (found by the census, engine-relevant)

The lab's hug-chain measurement is exponential in nesting depth
(2^depth re-measures — each hug parent re-enters children twice) and
duplicates resolver reports on the re-entry. Fine for the lab's scenes;
phase 4's single-tree layout removes it structurally. Recorded so the
per-container architecture is never shipped as-is.
