# E7 — shape definition vs layout; the points problem; the two scales

Owner question (2026-07-07, post-run): did the model solve the
**XYWH-vs-shape-definition** semantic problem? What about the **points
problem** — when layout changes the box, do points update? And when
content "scales", is it **geometry-scaled or post-render-scaled** — and
what happens to an **image fill**? (Hint given: Framer/Sketch solve this
with an explicit `<Graphics>`/`<svg>`-like container node.)

Method: 5-agent research fan-out (Framer runtime source from the shipped
npm package, Sketch file-format + Athens docs, Figma plugin API + .fig
format, SVG2/CSSWG spec, and a grounding pass over the current Grida
engine/editor). Full structured facts in the workflow record; the
decisive ones are quoted below.

## 1. XYWH vs shape definition — SOLVED (by design, lab-proven)

The anchor answer is the _inversion_: a shape has no intrinsic geometry
the box must chase — **geometry is a function of the box**
(`ShapeDescriptor`, size-free, evaluated at the resolved box; a.md §3.2,
problem P3). W/H are ordinary layout participants; there is nothing for
layout to fight.

- This is also what the current engine already does for primitives
  (verified: `to_shape()` rebuilds from `size` each call; fbs
  `CanonicalLayerShape` "intentionally does NOT encode size") — the model
  ratifies the direction rather than inventing one.
- It is also Figma's answer (verified via plugin API/.fig: star =
  `pointCount` + `innerRadius` _ratio_ + size; `cornerRadius` in px, so a
  non-uniform resize re-evaluates the outline and arcs stay circular).
- Lab-proven for rect/ellipse/line through flex/stretch/grow.

## 2. The points problem — industry-convergent answer; a.md needs E-A9

Three independent systems converged on the same structure, and none of
them rewrites points on resize:

| system          | storage                                                                                                                                                                        | resize                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Sketch          | curve points normalized 0–1 relative to the frame — "so they don't require any update in case the frame of the layer changes"; the format has **no transform property at all** | frame write only                     |
| Figma           | `.fig` vectorNetwork stored against `vectorData.normalizedSize`; render maps by `size / normalizedSize`; the plugin API _presents_ materialized coordinates                    | size write only                      |
| SVG             | `viewBox` — a render-time coordinate-system transform                                                                                                                          | viewport write only                  |
| **Grida today** | absolute vector network; the TS reducer **bakes** the resize into every vertex + tangent (`VectorNetworkEditor.scale`)                                                         | **full point rewrite** — the outlier |

The bake is exactly the class of behavior the model exists to kill:
write amplification (a drag writes N vertices), CRDT hostility
(resize ∥ vertex-edit conflicts on every vertex), float accumulation
over repeated resizes.

**E-A9 (spec delta):** `vector`'s box source changes from
"measured (network bounds; no size intent)" to **declared-with-reference-
space**: points live in a reference space; the node carries ordinary
size intent; resolution maps points by `resolved_size / reference_size`
(render-time geometry scale — never a document write). Consequences:
resize = 1–2 field writes like every other kind; vectors under
layout-imposed extents (grow/stretch) become _defined_ for free (the
same mapping) — closing a real hole in a.md §4/§6; T-5 still holds
(vertex edits update the reference bounds); the current editor's
point-bake becomes an X-SELF break with a migration
(bounds-normalize once at import).
Predictability cost, mitigated: the text IR (an agent projection) can
present materialized coordinates, exactly as Figma's plugin API does
over its normalized storage.

### 2b. Reference: our own io-figma already implements the mapping

The owner's hint checks out in-repo (studied 2026-07-07, `io-figma`):

- **Logic**: `packages/grida-canvas-io-figma/lib.ts` —
  `scaleVectorNetworkFromNormalizedSize()` maps blob coordinates by
  `sx = size.x / normalizedSize.x` (etc.), applied to **both vertex
  positions and segment tangents**, at import time.
- **Proof Figma never rewrites the blob on resize**: the test
  `__tests__/iofigma.kiwi.vector-network.test.ts` deliberately selects a
  real `.fig` fixture node **where `normalizedSize != size`** — such
  nodes exist in shipped files precisely because resize only writes
  `NodeChange.size` and leaves the blob untouched (the owner's
  observation, fixture-verified).
- **Notes**: `docs/wg/feat-fig/glossary/fig.kiwi.md`
  §"Vector network coordinate space (observed)" documents the mapping,
  the mis-render consequence of reading blobs "as-is", and one caveat
  that **refines E-A9**: _some blobs have non-zero bbox origins
  (minX/minY ≠ 0), so an additional translation may be needed beyond
  pure scaling_ — i.e. the reference space is a **rect, not a size**.
  E-A9 should either store a reference _rect_ or normalize the origin
  at write time; a bare `reference_size` under-specifies.
- **Polygon/star: the mechanism does NOT apply, because there are no
  points.** In the kiwi data, STAR/POLYGON are purely parametric —
  `count`, `starInnerScale`, `cornerRadius`, `size` (lib.ts `star()`
  uses `nc.count`/`nc.starInnerScale`; polygon `nc.count ?? 3`). No
  stored outline exists to be in any coordinate space; resize
  re-derives. Only VECTOR carries the normalized blob.
- **A tidy asymmetry worth naming**: the _editable_ network lives in
  reference space (intent), while the _pre-baked_ `fillGeometry`/
  `strokeGeometry` command blobs — when present — are derived, size-space
  geometry (our converter prefers them and applies no normalizedSize
  scaling). Figma's own file thus mirrors the model's tier split:
  intent in a stable space, resolved output baked separately.
- **The caveat the owner predicted** is real and documented: any tool
  editing blob data directly must know the mapping (the Plugin API
  hides it by materializing coordinates into current-size space). For
  anchor/E-A9 the same division of labor applies: the binary format
  keeps the reference space (round-trip- and CRDT-friendly — resize
  ∥ vertex-edit touch disjoint fields); the **text IR materializes**,
  so agents read/write real coordinates.

## 3. Scaled how — geometry-at-render, never raster; and TWO scales

- SVG's viewBox stretch is **geometry scaling at render** (a live
  coordinate transform; content re-rasterizes crisp at device
  resolution). Framer is the cautionary partial exception: its editor
  canvas post-render CSS-scales the Graphic for drag performance, and
  small SVGs are flattened to a stretched `background-image` data-URI.
- Every design tool refuses SVG's stroke default for plain resize:
  strokes stay px-constant (Sketch: "strokes… stay the same when you
  resize"; Figma: `resize()` never touches strokeWeight; Grida today:
  same). The **anchor model has this by construction** — stroke width is
  a style scalar that never enters the geometry mapping;
  `vector-effect: non-scaling-stroke` semantics without the attribute.
- The second scale — "scale it like a picture" — is everywhere an
  **explicit, separate gesture** that rewrites parameters: Figma
  `rescale()`/K (strokes, blurs, font size), Sketch K (border, shadow,
  text), and Grida already ships it (`parametric_scale`, K). The model
  keeps this as an op-layer _bake_, not a stored mode. For a _retained_
  picture-scale (rare), the structural home is a `lens` `Scale` op —
  under it strokes and everything else scale visually, which is exactly
  SVG/Framer-Graphic semantics, quarantined and opt-in.

## 4. Image fills — re-fit at the box, scaled only inside a lens

Consensus (Figma scaleModes; current Grida verified: the image matrix is
recomputed from `container_size` at paint time, `BoxFit` +
box-relative `Transform` + `Tile`): a fill is **paint-tier state
re-evaluated at the resolved box**, never baked into geometry. Framer's
Graphic does the opposite (`objectBoundingBox` pattern,
`preserveAspectRatio="none"` → fills stretch and distort with the box) —
and that distortion is among its documented user complaints.
**E-A10 (rule, locked):** paints evaluate at the resolved box per their
fit mode; the only way an image fill "scales like a picture" is through
a lens op — same quarantine as every other picture-scale.

## 5. The `<Graphics>` container — deliberately not required

Both hinted systems make proportional graphics a _container mode_:
Framer's Graphic layer (opaque SVG string, stretch semantics) and
Sketch's Athens **Graphics** container (2025.1 — "contents resize
proportionally", no pinning inside, pasted SVG becomes one). The
evidence says the container works but its _mandatoriness_ hurts: Framer
users buy SVG code components to escape Graphic resize behavior, K was
added (Feb 2025) because plain resize couldn't scale styles, and
community threads complain about px-only sizing and aspect-lock fights.

Anchor inverts the ergonomics: the **default** world is the layout world
— shapes are first-class citizens with parametric geometry and vectors
carry the normalized mapping _per leaf_, so no container is ever needed
for the common case (including "resize an imported icon group":
per-child size writes, no point rewrites, no wrapper). The proportional
world still exists, but as the opt-in escape (`lens` scale / wrapper
frame), not as a prerequisite node users must remember to create.

## Verdict

Question 1 was already solved and proven; question 2 exposes the one
real correction (**E-A9** — adopt the Sketch/Figma reference-space
mapping for `vector`, retiring today's point-bake); questions 3–4 were
implicitly right and are now locked as explicit rules (**E-A10**, two
scales doctrine); the Graphics-container path is rejected as a
requirement with evidence, kept as the lens escape.
