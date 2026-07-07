# COMPAT — the import maps (css → grida · svg → grida · figma → grida)

2026-07-07. The three import sources the model must be able to absorb,
mapped primitive-by-primitive into the anchor vocabulary. This document
is also a **standing design harness (H13)**: any change to the model
must state its effect on these maps; a change that silently moves rows
toward `unsupported` is a regression even if every internal test stays
green.

**Verdicts** — `native` (direct field map) · `surgery` (tree
restructuring, semantics preserved) · `trick` (non-obvious but exact
construction) · `lens` (quarantine wrap) · `paint` (lands in the paint
model, not node geometry) · `degrade` (approximate, loss declared) ·
`unsupported` (flatten/rasterize/drop) · `out-of-scope`.

Full row data (33 CSS + 31 SVG + 30 Figma rows with per-row edge notes)
was produced by the 2026-07-07 mapping run; the tables below are the
complete verdict census with the sharpest edges inlined.

---

## 1. CSS → grida

**Posture: the positioned/flex core is nearly the native tongue** —
insets literally are the Pin/Span vocabulary (`right:24` = `Pin{End,24}`,
`left+right` = `Span`) and flexbox maps 1:1 minus three declared holes.
The systematic surgeries: block flow → flex column; margins →
gap/padding/spacers; z-index → fractional-index resort. Anything scroll-
or responsiveness-coupled freezes at the import viewport **or stays live
in the htmlcss engine via the `embed` kind — the sanctioned pressure
valve** (Grida ships a real CSS engine; import-to-canvas is a choice,
not the only door).

| primitive                      | verdict         | map / sharpest edge                                                                                                                         |
| ------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| position:absolute + insets     | **native**      | Pin/Span per edge; intent survives resize. Edge: CSS containing block ≠ direct parent → re-parent surgery; auto-inset static positions bake |
| display:flex + direction/wrap  | **native**      | LayoutBehavior. Edge: no `*-reverse` (index-reverse surgery); no align-content; wrap-reverse unrepresentable                                |
| justify-content                | **native**      | main_align 1:1. Edge: safe/left/right collapse                                                                                              |
| align-items/self               | **native**      | cross_align/self_align. Edge: baseline = DEFER (X-CSS-9), bakes stale offsets                                                               |
| flex-grow/basis                | **native**      | grow + SizeIntent. Edge: `flex:1` ⇒ basis 0 ⇒ write Fixed(0)+grow:1, not Auto                                                               |
| flex-shrink                    | **degrade**     | X-CSS-2 deviation (shrink:0); bake shrunk sizes at import viewport                                                                          |
| gap                            | **native**      | direct. % gap bakes                                                                                                                         |
| block flow / static            | **surgery**     | → flex column + stretch; margin collapsing must resolve _before_ conversion                                                                 |
| margin                         | **surgery**     | gap/padding/spacers; negative margins → pins or lens (visibly wrong if flow relied on displacement)                                         |
| margin:auto                    | **trick**       | Pin{Center}/alignment/grow-spacers                                                                                                          |
| padding                        | **native**      | EdgeInsets; on non-frames → wrapper                                                                                                         |
| border + box-sizing            | **paint**       | strokes (border-box by construction); heterogeneous per-side borders degrade                                                                |
| position:relative              | **lens**        | flow slot + lens Translate — exact CSS. Edge: containing-block duty doesn't transfer                                                        |
| position:fixed                 | **surgery**     | re-parent to viewport root; scroll immunity gone → embed for live                                                                           |
| position:sticky                | **degrade**     | freeze at scroll 0; embed for live                                                                                                          |
| display:grid                   | **degrade**     | run grid once, bake cells to Pin/Span (mode:grid is the additive future); fr/minmax responsiveness lost; embed for live                     |
| transform translate/scale      | **lens**        | ordered ops, exact CSS paint-only semantics; % translate bakes                                                                              |
| transform rotate (in flow)     | **native**      | DEC-0 flipped the default to visual-only: header rotation IS CSS rotate semantics now (lens-rotate ≡ header-rotate; X-CSS-5 fork dissolved) |
| skew/matrix                    | **lens**        | the quarantine's founding purpose (wrap, never degrade)                                                                                     |
| 3D + perspective               | **lens**        | spec-reserved vocabulary; preserve-3d across elements doesn't compose (each lens flattens)                                                  |
| transform-origin               | **trick**       | Alignment enum or Translate-conjugation (costs the one-op-one-channel story)                                                                |
| overflow/clip                  | **native**      | clips_content; scroll/auto degrade → embed for live panes                                                                                   |
| z-index/stacking               | **surgery**     | resort fractional indices; cross-hierarchy interleaving (negative z, cousins) unrepresentable                                               |
| %-/vw/em units                 | **degrade**     | bake to px. Exception: 100% → Span{0,0}/stretch — the one intent-preserving unit                                                            |
| min/max/fit-content            | **degrade**     | X-CSS-3 DEFER; text Auto covers text only; min-content floor absent                                                                         |
| aspect-ratio + clamps          | **native**      | direct. Edge: anchor never overrides Fixed (CSS transferred-size cases diverge)                                                             |
| display:none                   | **native**      | active:false (excluded from measure — tested)                                                                                               |
| display:contents               | **surgery**     | splice children up (group is NOT equivalent — it has a derived box)                                                                         |
| inline formatting (text+atoms) | **degrade**     | pure text → text kind; atom interleaving inside wrapped lines is outside the model                                                          |
| float/clear                    | **degrade**     | bake positions; wrap-around needs exclusions we don't have                                                                                  |
| writing-mode / rtl             | **unsupported** | X-CSS-7 declared N; BiDi is text-internal only                                                                                              |
| order                          | **surgery**     | rewrite fractional indices; a11y/source order distinction erased                                                                            |
| tables                         | **degrade**     | bake column widths into nested flex; shared column sizing has no home                                                                       |

## 2. SVG → grida

**Posture: mostly native, with the paint model and usvg pre-processing
absorbing what the node model shouldn't.** E5 already measured
transforms (native 73% / flip 26% → E-A2 / true shear 0.95% → lens).
The remaining edges cluster in four families: **viewBox proportional
scaling** (SVG's scaling-stroke default is _our_ exotic case — the exact
inversion of law 5), **instancing** (`use`/`symbol` = copy-on-import,
divergence declared), **text** (baseline math, per-glyph positioning,
textPath), and **paint servers** (`pattern` has no home yet).

| primitive                         | verdict         | map / sharpest edge                                                                                                                                  |
| --------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| root `<svg>` viewBox + pAR        | **trick**       | frame Fixed×Fixed; uniform viewBox scale → K-bake at import; `pAR="none"` non-uniform **cannot** K-bake strokes → lens or accept px-stable deviation |
| absolute x/y everywhere           | **native**      | free frames + Start pins (current importer's model already)                                                                                          |
| `<g>`                             | **native**      | group (derived box, E-A1). Edge: `<g filter/clip/mask>` re-kinds to frame (effects are ignored-by-rule on group)                                     |
| `<path>` (arcs incl.)             | **native**      | vector (E-A9 reference rect); arcs pre-baked to cubics by usvg (render-exact, not round-trippable)                                                   |
| `<rect rx/ry>`                    | **native**      | shape Rect + corner radius. Edge: rx≠ry elliptical corners have no home; **px-stable radius vs SVG's scaling radius under viewBox**                  |
| `<circle>/<ellipse>`              | **native**      | Ellipse descriptor. Edge: usvg normalizes to path — importer must pattern-match back or accept vector                                                |
| `<line>`                          | **trick**       | shape/Line box construction (length × Fixed(0), rotation)                                                                                            |
| `<polygon>/<polyline>`            | **native**      | vector or normalized Polygon. Edge: axis-aligned lines → zero-extent ref axis (B2 POL)                                                               |
| nested `<svg>`                    | **surgery**     | frame + clip + viewport transform (K-baked uniform / lens non-uniform)                                                                               |
| `<defs>+<use>`                    | **degrade**     | copy-on-import (usvg); instancing divergence is the declared loss                                                                                    |
| `<symbol>`                        | **surgery**     | per-use instantiation; different use sizes ⇒ divergent K-bakes                                                                                       |
| `<switch>` / `<a>`                | **degrade**     | first-passing-branch frozen / link metadata dropped                                                                                                  |
| % units                           | **degrade**     | baked by usvg; percent pins (a.md §12) recover this later                                                                                            |
| `<text>` chunks/tspan             | **surgery**     | shipped model: text-import.md (group of measured text chunks); per-glyph x/y lists flatten                                                           |
| text-anchor                       | **trick**       | is literally a Pin anchor (middle→Pin{Center})                                                                                                       |
| baselines                         | **degrade**     | baseline→top conversion needs real ascent (current FIXME approximates ascent=font_size)                                                              |
| `<textPath>`                      | **unsupported** | flatten to vector via usvg; no lens construction exists                                                                                              |
| markers                           | **surgery**     | usvg bake (lossless render) or native stroke markers on open geometry                                                                                |
| `<clipPath>`/`<mask>`             | **surgery**     | sibling-mask construction (importer ships it); oBB units freeze against import-time bbox                                                             |
| `<filter>`                        | **degrade**     | blur/drop-shadow → effects; arbitrary fe-graphs unsupported (rasterize or drop)                                                                      |
| gradients                         | **paint**       | entirely in the paint model (E5 split); shared userSpace gradients denormalize per node                                                              |
| `<pattern>`                       | **unsupported** | no Pattern paint yet (wg/feat-svg/pattern.md 'not started'); rasterize-tile fallback                                                                 |
| opacity vs fill-opacity           | **native**      | header opacity vs paint opacity — semantically distinct, both mapped                                                                                 |
| paint-order                       | **trick**       | split into stacked siblings (edit-coupling cost)                                                                                                     |
| vector-effect: non-scaling-stroke | **native**      | **the default, by construction** (law 5) — the inversion: SVG's scaling stroke is the exotic import                                                  |
| stroke props                      | **native**      | dasharray/cap/join/miter 1:1; dashoffset currently dropped (importer gap)                                                                            |
| CSS-in-SVG                        | **degrade**     | cascade flattened at parse; @media frozen to one branch                                                                                              |
| SMIL                              | **unsupported** | static t=0 imports; animateTransform→lens-channel mapping is a future runtime story (H7)                                                             |
| `<foreignObject>`                 | **degrade**     | embed kind (format:html) — needs pre-usvg extraction; declared h vs measured-h mismatch                                                              |

## 3. Figma → grida

**Posture: the owner's "almost 100%, workaround exists" is structurally
right — Figma is the closest cousin (several anchor mechanisms are
Figma's own, measured: normalizedSize = E-A9, parametric stars, px-stable
K/rescale split, layout-visible rotation = X-FIG-1).** The honest
residue: one _model_ gap (SCALE constraint → percent pins, deferred;
prevalence unmeasured until **E9**), one _definition_ fork (bool bounds:
op-result vs Figma's operand-union — constructible divergence), and four
_importer_ gaps that are work, not model problems.

| primitive                                     | verdict                          | map / sharpest edge                                                                                                                                                                                                                                           |
| --------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| auto-layout frame                             | **native**                       | LayoutBehavior 1:1 (spacing/padding/align). Edge: flex emission is currently opt-in (`prefer_auto_layout`); default imports a position snapshot                                                                                                               |
| primary/counter align                         | **native**                       | main/cross align (anchor superset). Edge: wrap's SPACE_BETWEEN cross-run distribution has no field; BASELINE falls to start                                                                                                                                   |
| FIXED/HUG sizing                              | **native**                       | Fixed/Auto SizeIntent                                                                                                                                                                                                                                         |
| FILL sizing                                   | **trick**                        | grow:1 / self_align:Stretch / Span{0,0} — the three-spellings map. **Importer gap: not yet encoded (bakes size today)**                                                                                                                                       |
| absolute-in-auto-layout                       | **native**                       | flow:Absolute + bindings                                                                                                                                                                                                                                      |
| constraints MIN/CENTER/MAX                    | **native**                       | Pin Start/Center/End — intent stored. Edge: pins bind the unrotated box, Figma constrains the rotated AABB (§2.1's recorded v1 refinement)                                                                                                                    |
| constraint STRETCH                            | **native**                       | Span{start,end} — exactly Figma's semantics incl. size-ignored                                                                                                                                                                                                |
| constraint SCALE                              | **degrade**                      | no v1 percent pins (a.md §12 additive). Prevalence unknown → **E9**                                                                                                                                                                                           |
| **group constraint-transparency**             | **surgery → native under E-A13** | children of GROUPs constrain against the _outer frame_ in Figma; anchor binds to the direct parent + E-A5 forbids non-Start under groups. Faithful import = **promote group→frame** or hoist; loses either grouping or responsiveness → **the GROUP.md fork** |
| rotation                                      | **native**                       | matrix→scalar (pivot translation compensated; CCW→CW negation)                                                                                                                                                                                                |
| rotated-in-auto-layout                        | **degrade**                      | DEC-0 (visual-only): Figma makes room, anchor does not — importer bakes these to `flow:Absolute` + pins at resolved position (geometry-exact, flow participation dropped); frequency = E9                                                                     |
| flips                                         | **native**                       | E-A2 flip_x/y, semantics built (E-A14: pivot per kind, `T·R·F` innermost). **Importer gap: currently bakes mirrors into path data (predates E-A2)**                                                                                                           |
| resize across zero (drag past the fixed edge) | **native under DEC-9=flip**      | Figma flips every kind (one shared render transform). Anchor `resize_drag` re-targets: extent stays \|w\|, axis flip toggles, pin re-anchors; out-and-back = document identity; typed negative W still rejects (NegativeExtent)                               |
| plugin-authored skew/matrix                   | **lens**                         | wrap-never-degrade; frequency unscanned (E9)                                                                                                                                                                                                                  |
| GROUP                                         | **native**                       | derived box + origin placement; X-FIG-4 deliberately N (no re-fit writes)                                                                                                                                                                                     |
| BOOLEAN_OPERATION                             | **native**                       | op enum 1:1, operands as children. **Fork: anchor box = op-result (D-5), Figma = operand union — divergent bounds constructible**                                                                                                                             |
| vector networks                               | **native**                       | normalizedSize _is_ E-A9 (fixture-proven). Edge: non-zero blob origins need the reference RECT                                                                                                                                                                |
| STAR/POLYGON/ELLIPSE arc                      | **native**                       | parametric 1:1 (REST fallback loses parametricity to baked paths)                                                                                                                                                                                             |
| corner radius + smoothing                     | **native**                       | field-mapped; smoothing needs the renderer formula                                                                                                                                                                                                            |
| strokes                                       | **native**                       | align/dash/per-side mapped. Edge: `strokesIncludedInLayout` has no home (stroke never consumes layout)                                                                                                                                                        |
| effects                                       | **native**                       | 4 effect types mapped. Edge: effects-on-GROUP is ignored-by-rule in anchor → re-kind to frame on import                                                                                                                                                       |
| fills/gradients                               | **paint**                        | per-paint transforms. Edge: flip-baked nodes keep fills in unbaked frame (importer bug class)                                                                                                                                                                 |
| image fills                                   | **paint**                        | scaleMode→BoxFit/Transform/Tile. Edge: TILE px-anchoring — re-tiles on resize (matches anchor law, differs from naive expectation)                                                                                                                            |
| text autoResize                               | **native**                       | (Auto,Auto)/(Fixed,Auto)/(Fixed,Fixed); TRUNCATE→max_lines+ellipsis. **Importer gap: maxLines parsed but never mapped**                                                                                                                                       |
| masks                                         | **surgery**                      | maskType 1:1 + sibling reorder (scope-start → sibling-order)                                                                                                                                                                                                  |
| SECTION/SLICE                                 | **native**                       | tray / dropped                                                                                                                                                                                                                                                |
| components/instances                          | **out-of-scope**                 | geometry-lossless snapshots; override intent lossy (not this map's concern)                                                                                                                                                                                   |
| layout grids                                  | **unsupported**                  | dropped; becomes visible when snap-to-grid ships                                                                                                                                                                                                              |

---

## Cross-cutting obligations this document creates

1. **H13 (the harness clause).** Every future model/spec change names
   its impact on these three tables. Moving a row _down_ the verdict
   ladder requires the same sign-off as breaking a conformance INV.
2. **E8/E9 stay blocking** (pedantic §D): E8 = the _outbound_ CSS
   projection (this doc is inbound-only by design); E9 = the .fig corpus
   scan that turns "almost 100%" into a number (SCALE prevalence, skew
   frequency, rotated-in-auto-layout counts).
3. **Importer work queue surfaced by the mapping run** (work, not model
   flaws): Figma FILL→grow/stretch encoding; flips→flip_x/y (post-E-A2);
   maxLines mapping; SVG stroke-dashoffset; group→frame re-kinding rules
   (`<g filter>`, Figma effects-on-group, constraint-carrying group
   children — pending the GROUP.md decision).
4. **The two escape valves are load-bearing**: `embed` (live web islands:
   sticky/scroll/grid/media-query content) and `lens` (CSS transforms,
   plugin matrices, SVG shear). Neither may regress without this
   document noticing.
