# Hit-testing — design notes for v2

> Lessons from a v1 hit-test implementation that lives on a private branch and is **not yet on `main`**. Source paths under `packages/grida-svg-editor/src/` referenced below describe that in-flight slice; the architectural lessons stand independently and feed the v2 design.

This document captures the investigation, bugs, and architectural lessons
from the v1 hit-test work so that v2 doesn't repeat them. It is
deliberately long: the cost of writing it once is far less than the cost
of re-discovering it.

If v1 is reverted (we're considering it), this document survives the
revert. The code is gone but the reasoning is preserved.

## Default behavior in v1 (opt-out by default)

`DEFAULT_STYLE.hit_tolerance_px = 0`. The cmath fat-hit picker is built
and tested, but **NOT active by default** — `_pick_node_at_world`
short-circuits to the legacy elementFromPoint + `walk_to_id` path
unless the host explicitly sets a positive tolerance. The reason:

- The cmath picker has the four known issues catalogued below (local-
  vs-world geometry for transformed shapes, etc.). On real-world SVGs
  it makes many items unselectable.
- The DOM path is renderer-correct for everything the browser knows
  how to paint — composed transforms, cascade, clip-path, fill-rule,
  pointer-events. No approximation. Pixel-exact only (no tolerance),
  but that's the v1 baseline UX, not a regression.

The cmath code stays in the codebase as opt-in until v2 lands the
render-time hit-layer architecture (see "Concrete v2 implementation
guide" below). Hosts that want to try fat-hit on simple SVGs (no
transforms, no cascade tricks) can opt in:

```ts
editor.set_style({ ...editor.style, hit_tolerance_px: 5 }); // opt in
editor.set_style({ ...editor.style, hit_tolerance_px: 0 }); // opt out (default)
```

Or from the dev console: `__svgEditor.set_style({ ...__svgEditor.style,
hit_tolerance_px: 5 })`.

## Background — what we were trying to solve

Thin SVG elements (1-px lines, hairline strokes) are nearly unselectable
under a zero-tolerance picker like `document.elementFromPoint`. The user
has to click _exactly_ on the painted pixel. The v1 goal was a fat-hit
picker: clicking within `N` screen pixels of any element should select
it.

The brief landed on a pure-cmath picker driven by attribute geometry
out of the document IR. The first iteration shipped and looked right on
simple fixtures. It then failed on two real-world inputs (slides
fixture, default.ts fixture), in different ways, for different reasons.

This document is the postmortem and the v2 design guide.

---

## What we built (v1)

A two-layer module at `packages/grida-svg-editor/src/core/hit-shape/`:

1. **`hit_shape_of_doc(doc, id) -> HitShape | null`**
   Pure document → typed shape converter. Reads attributes (`cx`, `cy`,
   `x1`, `y1`, `points`, `d`) and produces a `HitShape` discriminated
   union (`rect | ellipse | segment | polyline | polygon | path`).
2. **`pick_at_world(p, opts) -> NodeId | null`**
   Topmost-first z-order walk. AABB pre-filter via `cmath.rect.pad` over
   `GeometryProvider.bounds_of`. Distance check via
   `point_distance_to_shape` against the intrinsic `HitShape`.

Wired in `dom.ts:_pick_node_at_world` as a primary picker, with
`document.elementFromPoint` originally retained as a fast path, then
retired entirely after the slides bug.

`EditorStyle.hit_tolerance_px` (default 4 → 5) is converted to world
units at pick entry: `tolerance_world = hit_tolerance_px / camera.zoom`.

---

## Bugs found

### Bug 1: `elementFromPoint` short-circuited past thin elements above a filled background

**Fixture**: slides — `<rect width="1920" height="1080" fill="#FAFAFA">`
under a hairline `<line>`.

**Symptom**: click 3 px below the line → background rect selected. Fat-
hit never ran.

**Cause**: the v1 picker tried `elementFromPoint` first as a "free fast
path." The browser returned the background rect (which IS painted at
that pixel). Walking up to `data-grida-id` returned a valid non-root id,
the picker short-circuited, and the cmath fat-hit fallback never
executed.

**Lesson**: `elementFromPoint` is not a free hedge. It answers
_"what's painted at this pixel"_, which is a different question from
_"what's the nearest geometry within tolerance"_. The two can disagree.
You cannot fall back from one to the other without a deliberate merge
function.

**What we did**: retired `elementFromPoint` from the picker entirely,
went pure cmath. This fixed the slides case but exposed Bug 2.

### Bug 2: attribute geometry is local-space, not world-space

**Fixture**: default.ts — `<g transform="translate(180 170) rotate(-12)">`
containing `<ellipse cx="0" cy="0" rx="120" ry="38">` (and many other
nested-transform groups).

**Symptom**: clicking visually on the orbit ellipse → no selection.
Clicking at world (0, 0) — empty canvas corner — could phantom-hit the
ellipse.

**Cause**: `hit_shape_of_doc` reads `cx="0"` directly off the attribute
and returns `{ kind: "ellipse", cx: 0, cy: 0, rx: 120, ry: 38 }`. That
shape is in the element's **local** coordinate system. The picker then
compares it against a **world-space** click point. The two are in
different frames when any ancestor has a `transform`. AABB pre-filter
still passes (because `bounds_of` correctly composes CTM — see "What
already worked" below), but the per-shape distance check operates in
mismatched coordinates and returns junk.

**Lesson**: any picker that reads attribute geometry directly is
implicitly choosing a coordinate frame. The IR alone cannot tell you
world-space coords for transformed descendants — that requires either
composing the CTM in user code, or asking the renderer (via
`getCTM()`).

### Bug 3: descendants of non-rendering containers stayed in the z-order

`<defs>`, `<symbol>`, `<clipPath>`, `<mask>`, `<pattern>` are tagged
transparent in v1 (their own hit-shape is null), but their **children**
were still walked. The polygon inside `<symbol id="star">`, the rect
inside `<pattern id="terrain">`, the circle inside `<clipPath>` — all
sat in the pick list.

In practice this was mostly latent because `getBBox()` on a non-rendered
element often returns local-space coordinates that the world-space
click never reaches. But the safety was coincidental, not principled.

**Lesson**: the transparent-tag check needs to be **ancestor-aware**.
If any ancestor is a non-paint container, the node never participates
in picking — regardless of its own tag. v1's tag-only check is wrong
for nested symbols / defs.

### Bug 4: `fill="none"` rects hit as if filled

`point_distance_to_shape` for `kind:"rect"` returns 0 for any interior
point. It doesn't read the resolved `fill` value. So a
`<rect fill="none">` (decorative frame, orbit ellipses with
`class="planet-ring"`, etc.) reports a hit anywhere in the interior,
even though only the stroke paints.

**Lesson**: distance-to-shape is not enough — you also need
**paint-aware semantics** (filled-vs-outline-only). That data is in
the cascade, not in the attribute geometry. Resolving it requires
`getComputedStyle` or replicating CSS cascade in user space.

---

## What already worked (the shared backend)

The pre-existing `SvgGeometryDriver.bounds_of` (in `dom.ts`) was already
correct for transformed shapes. It composes ancestor transforms via the
DOM's `getCTM()`:

```ts
const ctm = ge.getCTM();
const project = (px, py) => ({
  x: ctm.a * px + ctm.c * py + ctm.e,
  y: ctm.b * px + ctm.d * py + ctm.f,
});
// corners of getBBox() projected via CTM = world-space rect
```

Every consumer that depends on `bounds_of` inherits world-space
correctness for free:

- `nodes_in_rect` (marquee selection)
- `core/snap` (snap targets, neighborhood discovery)
- HUD chrome (selection box, resize handles, measurement guides)
- Translate pipeline (via snap)

**None of these have Bug 2.** They've never had it. The bug is unique
to the v1 hit-shape module's decision to bypass the DOM-composed CTM
and read attribute geometry directly.

This is the single most important takeaway for v2: **the editor already
has a working world-space geometry backend. Use it. Don't build a
parallel one off the IR.**

---

## Architectural options surveyed

In order of increasing complexity (and decreasing approximation):

### (Z) Revert to `elementFromPoint`, no fat-hit

v1's baseline before this work. `elementFromPoint` + walk to
`data-grida-id`. Pixel-exact. Browser composes everything. No tolerance.

**Pros**: simple, correct for everything the browser paints, zero new
code.
**Cons**: thin elements need pixel-exact aim. The original UX
complaint that motivated v1 returns.

### (A) Compose ancestor transforms ourselves in cmath

For each candidate, walk parents, multiply matrices, transform shape
coordinates to world space. Distance check then operates in world.

**Pros**: keeps the pure-cmath architecture, fixes Bug 2.
**Cons**: a rotated ellipse becomes a general conic that doesn't fit
the `HitShape.ellipse` model (axis-aligned only). Doesn't address Bugs
3, 4, or any cascade-dependent semantics (fill=none, pointer-events,
visibility). Each new SVG feature is a new branch.

### (B) Bounds-rect fallback for transformed shapes

When any ancestor has a `transform`, fall back to the world-space AABB
from `bounds_of`. Loses fat-hit precision for transformed thin elements
(a rotated line becomes its bounding rect) but at least it picks the
right id.

**Pros**: simpler than (A), fixes Bug 2 functionally.
**Cons**: tolerance against an axis-aligned rect of a rotated shape is
loose. Still doesn't fix Bugs 3, 4.

### (C) Two-pass: `isPointInFill`/`isPointInStroke` + cmath tolerance

Pass 1 — for each candidate that is an `SVGGeometryElement`, transform
the click to local-space via `getCTM().inverse()` and ask the browser
`isPointInFill(local) || isPointInStroke(local)`. This is the
renderer's own per-element hit-test. It bypasses `pointer-events` and
`visibility` (geometric, not pointer-target), composes CTM, honors
fill rule, honors stroke geometry (width, linecap, linejoin). Pass 2 —
fall back to cmath for tolerance bands.

**Pros**: renderer-correct for the exact case. Fixes Bugs 2 and 4.
**Cons**: five conditional paths in the picker (geometry-element vs
not, exact vs near-miss, tolerance scaling for rotated shapes,
transparent-tag ancestry, z-order tiebreak). Day-0 acceptable, day-300
sediment.

### (D) Render-time hit-layer, single-rule picker (the proposal at end of investigation)

Render every editor-managed element twice: once visibly (the original)
and once as an invisible "hit clone" with
`fill="transparent" stroke="transparent" stroke-width="2 * tolerance"
pointer-events="all"` and the same `data-grida-id`. The picker becomes
five lines: `document.elementsFromPoint(...)` → walk the stack →
return the first non-root `data-grida-id`.

**Pros**: renderer is the sole oracle for everything. Tolerance is
materialized into the DOM, so the renderer naturally hit-tests against
it. No fallback paths. No branching by element type. No special-case
for text / use / image / transformed / fill=none — the hit clone
generalizes uniformly. Negative line count vs v1.
**Cons**: doubles the rendered DOM (editor-only; stripped on
serialize). Tolerance changes require re-render. Per-tag clone recipes
need careful handling for edge cases (`<use>`, very large stroke
widths, etc.). One-time complexity in render-time cloner; zero ongoing
complexity in picker.

### (W) WASM SVG / CSS renderer

We don't ship our own renderer for this package today. If we did
(parity with the `crates/grida` canvas), hit-testing comes along
naturally because we own every paint decision. Not a v1 or v2 option —
mentioned for completeness.

---

## The principle (please read this before designing v2)

> The renderer owns hit-test ground truth. The editor owns selection
> policy. cmath is a tolerance approximator, not an oracle.

What follows from this:

1. **Don't re-implement SVG.** Don't parse cascade, don't compose CTM,
   don't model fill rules, don't simulate strokes. The browser does
   all of it correctly because the browser paints the pixels.
2. **Ask the renderer.** Either via `elementsFromPoint` (paint stack)
   or per-element via `isPointInFill`/`isPointInStroke` + `getCTM`.
   Both APIs exist; we just have to use them.
3. **Tolerance is policy, not correctness.** Materialize it at render
   time (the (D) hit-layer approach) or apply it as a clearly-scoped
   secondary pass — but don't conflate it with the truth-grounded
   question of "what's painted here."
4. **`elementFromPoint` has real constraints** that disqualify it as a
   pure oracle for an editor — `pointer-events: none` and
   `visibility: hidden` elements are invisible to it, but we want them
   selectable. The fix is `isPointInFill`/`Stroke` (per-element,
   geometric, bypasses these) **or** force `pointer-events: all` on
   every editor-managed element at render time, which makes
   `elementsFromPoint` editor-correct.
5. **`bounds_of` (the existing DOM-CTM backend) is the right backend
   for _anything_ that needs world-space geometry**, not just
   bounds-marquee. v1's mistake was building a parallel IR-driven
   backend for hit-shape; v2 should reuse the DOM backend or replace
   it with a WASM equivalent — never run two in parallel.

---

## Concrete v2 implementation guide

The recommended architecture is (D) — render-time hit-layer + 5-line
picker. The work breakdown:

**Render-side changes** (`dom.ts:render`):

1. After emitting each editor-managed element, emit a hit-clone with
   the recipe:
   ```svg
   fill="transparent"
   stroke="transparent"
   stroke-width="{2 * hit_tolerance_world}"
   pointer-events="all"
   data-grida-id="{same id as original}"
   ```
   Same geometry, same transform stack (or wrap the clone in a sibling
   under the same parent `<g>` so it inherits the same composed CTM).
2. Append hit-clones to a `<g class="hit-layer">` group placed AFTER
   the visible content in document order (so it sits on top in paint
   order). Or use SVG paint-order to lift it.
3. On `editor.serialize()`, strip the hit-layer.
4. Re-render the hit-layer whenever
   `geometry_version || hit_tolerance_px` changes. (No need to invalidate
   on pure paint changes — fill / stroke don't move the hit zone.)

**Per-tag clone recipes**:

- `<rect>`, `<circle>`, `<ellipse>`, `<line>`, `<polyline>`,
  `<polygon>`, `<path>`: clone the element verbatim with the recipe
  attributes overriding fill/stroke/stroke-width/pointer-events.
- `<text>` / `<tspan>`: clone as a `<rect>` over `getBBox()` (text glyph
  outlines aren't directly clonable for hit testing in a useful way;
  bbox is the editor norm).
- `<use>` / `<image>`: clone as a `<rect>` over `getBBox()`.
- `<g>`, `<svg>`, `<defs>`, `<symbol>`, etc.: no clone (transparent).
  Descendants of non-paint containers (`<defs>`, `<symbol>`,
  `<clipPath>`, `<mask>`, `<pattern>`): no clone for any descendant.
  Walk-ancestry check, not just tag check (Bug 3 lesson).
- Tspans rendered inside `<text>`: usually skip; let the parent
  `<text>`'s bbox handle it. Or emit one rect per glyph run if precise
  tspan-level selection is wanted (orthogonal).

**Picker** (`dom.ts:_pick_node_at_world`):

```ts
private _pick_node_at_world(p: Vec2, allow_root: boolean): NodeId | null {
  const screen = this.camera.world_to_screen(p);
  const cr = this.container.getBoundingClientRect();
  const doc = this.container.ownerDocument;
  const root_id = this.editor.tree().root;
  for (const el of doc.elementsFromPoint(cr.left + screen.x, cr.top + screen.y)) {
    if (!(el instanceof SVGElement)) continue;
    const id = el.getAttribute(ID_ATTR);
    if (!id) continue;
    if (id === root_id && !allow_root) continue;
    return id;
  }
  if (allow_root) {
    // measurement HUD fallback — root is the canvas frame
    const root_bounds = this._geometry_provider?.bounds_of(root_id);
    if (root_bounds && cmath.rect.containsPoint(root_bounds, [p.x, p.y])) {
      return root_id;
    }
  }
  return null;
}
```

That's the entire picker. No cmath, no transparent-tag filter, no
distance-to-shape, no tolerance scaling — those all live at render
time, where they belong (geometry lives there too).

**Things to verify in v2**:

- `elementsFromPoint` is exposed in jsdom too (or stub it for tests).
- `pointer-events="all"` on hit-clones is honored cross-browser. Should
  be — it's spec.
- Hit-clone `<use>` with `xlink:href` references the same content as
  the original (`<symbol>` lookup works at render time).
- Hit-clones with very large stroke widths don't push the SVG's overall
  bbox outward in a way that affects camera fit or other geometry
  consumers. (Render the hit-layer with `overflow: hidden` on the
  container, or store geometric extents separately.)

**Tests that survive from v1**: none, deliberately. The new test
surface is render-side ("does each renderable node get a hit-clone
with the right attrs?") plus picker-side ("does
`elementsFromPoint(x, y)` resolve to the topmost hit-clone's id under
various stacking conditions?"). The cmath primitive tests
(`segment.point_distance`, `polyline.point_distance`) become dormant —
keep them if you ever want them, delete if not.

---

## What v2 must NOT do

- ❌ Build a second world-space geometry backend off the document IR.
  Use `bounds_of` (DOM `getCTM`) or replace it once; don't run two in
  parallel.
- ❌ Try to "approximate" SVG semantics (fill rule, stroke geometry,
  cascade) in user space without owning the renderer. Always wrong on
  some feature you didn't anticipate.
- ❌ Mix `elementFromPoint` with cmath via "fast-path + fallback."
  They answer different questions; one is not a fallback for the
  other.
- ❌ Treat ancestor `<g transform>` as something the editor's hit-test
  needs to compose by hand. The DOM already does it. Use the DOM.
- ❌ Special-case `<text>` / `<use>` / `<image>` with per-tag pickers.
  Generalize via a uniform clone recipe (rect over getBBox is fine
  for these).

---

## Why v1 went wrong (a one-paragraph summary for future me)

I framed the brief as "pure cmath, document-driven, DOM-free." That
was aesthetic preference, not correctness. The cleanest architecture
is the one that does the **least re-implementation**: the renderer
already knows how to hit-test its own output, the existing
`bounds_of` already knows how to compose CTM, and the renderer's DOM
already speaks `pointer-events`. v1 ignored all three of these and
reproduced bad versions of them in user code. v2 should reuse them.

---

## See also

- `packages/grida-svg-editor/docs/geometry.md` — how `bounds_of`
  composes CTM. Read before v2. (Lands with the implementation slice.)
- `crates/grida` — the WASM-rendered canvas; if `@grida/svg-editor`
  ever ports to a non-DOM backend, hit-testing follows the renderer
  there too.
