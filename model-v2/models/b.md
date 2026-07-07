# Model B — `sheet`

**sheet** — the property sheet model. A node _is_ a flat sheet of registered
properties, arbitrated by rulebook. The name prices the model's cost — sheets
accumulate: entries can coexist, contradict, go dormant, and resurrect.

Status: **finalist, under a re-reading** (see [`../finale.md`](../finale.md)).
History of this status, kept honest:

1. First **re-scoped** by [`../axes.md`](../axes.md): as an _invented_
   CSS-lookalike IR, its arbitration semantics fail **H12 (set-means-set)**
   and its representation/protocol survive as Axis-2 options.
2. Then **re-instated to the finale** under the _adopt_ reading: CSS
   top-to-bottom, nothing invented — CSSWG specs as the normative text,
   Chromium as the conformance oracle (the repo's `htmlcss` parity loops
   already practice this), Taffy/DOM-backend as native implementations,
   editor-layer write discipline answering H12 (the Webflow precedent:
   CSS-as-design-tool-IR is proven). The H12 model-level fail _stands_ and
   is consciously carried, not waved away.

The document below is the original undivided design; read it with the
adopt re-reading in mind.

Originally: **proposed** (phase 2 candidate, rival to
[`anchor`](./a.md)). CSS-faithful, taken seriously end-to-end: a node is a
sparse sheet of registered properties; conflicts are resolved by rulebook,
not by type structure; transforms are post-layout.

Designed best-faith: this is what a 2026 flat model looks like when built by
someone who believes in it, with its costs named rather than hidden.

---

## 0. Ground commitments

- **One node shape.** A node is `{ id, parent+order, kind, sheet }` where
  `sheet` is a sparse map over a **closed, versioned property registry**.
  There are no per-kind fields; `kind` selects render behavior and an
  applicability column, like CSS `display`.
- **One mutation op.** The entire edit protocol is
  `set(node, property, value)` / `clear(node, property)`. History, undo,
  diffing, patching, multiplayer, inspector tooling — all uniform over
  property triples. This is the model's crown jewel.
- **Conflicts are resolved, not prevented.** Over-constrained geometry is
  legal in the document; the registry's resolution rules pick winners.
  The price is _dormancy_ (§3).
- **Transforms are post-layout** (CSS semantics). Layout never sees rotation;
  a rotated flex child occupies its untransformed box and may visually
  overlap siblings. Defined, documented, designer-surprising.
- Unset property = the registry's **initial value** (CSS "initial value"
  concept). Unset is absence in the sheet — cheap and CRDT-clean.

---

## 1. The property registry (v1)

The registry is the spec: every property row defines
**type · initial · applies-to · resolution/conflict rule**. Grouped:

```
identity     name, active=true, locked=false
geometry     left?, right?, top?, bottom?          // px; each independently optional
             width?=auto, height?=auto             // px | auto
             min-width?, max-width?, min-height?, max-height?
             aspect-ratio?
transform    rotation=0, scale-x=1, scale-y=1, translate-x=0, translate-y=0
             transform?=[]                          // op list incl. skew/matrix/3D
             transform-origin=(50%, 50%)
flow         layout=none|flex, direction=row, wrap=false,
             main-align=start, cross-align=start, padding=0, gap=(0,0)
             position=in-flow|absolute, grow=0, self-align=auto
layer        opacity=1, blend-mode=pass-through, mask?, effects?
             clips-content=false
surface      fills=[], strokes=[], stroke-width, stroke-style,
             corner-radius, corner-smoothing
content      content?                               // one slot, typed union (§4)
```

~40 properties. Every property exists on every node; whether it _does
anything_ is the registry's applies-to column (§6). Adding a capability =
adding a registry row — no node kind is ever touched (additive evolution at
its purest).

---

## 2. Geometry resolution (the rulebook core)

Per axis, from the sheet (parent's resolved extent `E`):

```
extent  w := width if set
             else E − left − right      if both left,right set
             else natural(content)      if measurable
             else initial per kind      (shape: error-by-rule, as Model A)
start  x0 := left                        if left set
             E − right − w               else if right set
             (E − w)/2                   else if neither (free default: 0 — see rule R1)
clamp:  min/max, then aspect-ratio if one axis under-specified
```

**Conflict rules (fixed, direction-independent — a canvas has no RTL):**

- R1 unset/unset → `x0 = 0` (top-left default; no CSS "static position"
  mystery).
- R2 `left` beats `right` when `width` is also set (`right` goes dormant).
- R3 `left+right` beat `width` for extent **only when `width` is unset**;
  a set `width` wins and `right` goes dormant (R2).

**Dormancy — the model's characteristic hazard, stated:**
a losing property stays in the sheet and **resurrects** when its winner is
cleared. Set `left=10, width=120`, later also `right=24` (dormant); clear
`width` → the node silently becomes a span. This is exactly CSS's behavior,
it is _defined_, and it is genuinely surprising. Model B accepts it as the
cost of never rejecting a write. (Contrast: Model A makes the conflict
unrepresentable; Model B makes it legal-and-arbitrated.)

Under a flex parent with `position: in-flow`, the geometry insets are
_ignored-by-rule_ (layout owns position; the properties stay in the sheet
and resurrect on detach — dormancy again, here doing useful work: detaching
restores the pre-layout position intent).

---

## 3. Transforms — post-layout, CSS Transforms Level 2 shape

Composition, after layout has produced the box, about `transform-origin`
(default center):

```
final = translate(translate-x, translate-y)
      · rotate(rotation)
      · scale(scale-x, scale-y)
      · eval(transform)          // the op list: skew | matrix | perspective | rotate-3d | matrix-3d
```

- The individual properties (`rotation`, `scale-*`, `translate-*`) are the
  **animation channels** — scalar, interpolable, winding-preserving. The
  `transform` list is the capability escape hatch, **on every node** — no
  quarantine wrapper exists or is needed (H8 everywhere; H1 pays, §7).
- **Layout never sees any of it.** The AABB fed to flex is the untransformed
  box. Rotated children overlap; the canvas visually lies relative to what a
  designer expects from auto-layout (the CSS trade, taken knowingly).
- This _is_ the two-lane animation story with only one lane: all motion is
  compositor-side. Layout-coupled motion (Figma smart-animate push) is out of
  scope by design — animating `width` re-layouts, animating `rotation` never
  does.

## 4. Content — one slot

`content` is a single property whose value is a typed union:

```
content = Shape(descriptor)        // size-free, box-mapped (same descriptors as Model A §3.2)
        | Text(content, style, align, overflow)
        | Image(ref, fit)
        | Vector(network)
        | Embed(markdown | html)
```

One slot means "a node with both text and shape" is unrepresentable — the
flat model borrows exactly one page from the typed book, because multi-content
precedence rules are the rulebook nobody can write well. `kind` and
`content` must agree (`kind` is derivable = redundant; kept as a fast
discriminant, validator-enforced — a named single-source concession, H5).

Groups/booleans/frames: `content` unset; children + `layout`/`bool-op`
properties define behavior. (`bool-op` is one more registry row, effective
only on nodes with children.)

## 5. Box sources, rotation pivot, groups

Orthogonal choices are inherited from Model A where B has no philosophical
stake: measured kinds (text/embed/vector) measure under
width-intent-as-constraint; groups/booleans derive bounds from children;
group `rotation` pivots at own origin with gesture compensation
(`transform-origin` applies to _transform properties_, which groups may also
use — dormancy rules arbitrate). Center pivot default via
`transform-origin: 50% 50%`.

## 6. Applicability

The registry's applies-to column, by property group × behavior context.
Because _every_ property exists on _every_ node, the matrix is
**~40 rows × contexts** — several times Model A's. Sample of the non-obvious
cells:

| property                      | on childless node             | on in-flow child                               | on group/bool                |
| ----------------------------- | ----------------------------- | ---------------------------------------------- | ---------------------------- |
| `layout`, `direction`, `gap`… | ignored-by-rule (no children) | effective (it may itself be a container)       | ignored-by-rule (group), n/a |
| `left/right/top/bottom`       | effective                     | **dormant** (layout owns; resurrect on detach) | effective                    |
| `width/height`                | effective / measure           | effective as basis                             | ignored-by-rule (derived)    |
| `grow`, `self-align`          | ignored-by-rule               | effective                                      | same as boxed                |
| `transform`, `rotation`…      | effective (post-layout)       | effective (post-layout — overlap allowed)      | effective                    |
| `content`                     | effective                     | effective                                      | ignored-by-rule              |

The full matrix is normative and must ship with the format — **this is the
CSS lesson as a deliverable**: B is only viable if this rulebook is written
with CSS-spec seriousness. Estimated at 5–10× Model A's documentation
surface.

## 7. Worked examples (H1 quartet)

```xml
<node kind="shape" left="10" top="20" width="120" height="80" rotation="15"
      content="rect"/>                     <!-- (a) — but NOTE: renders overlapping-
                                                siblings if placed in flex -->
<node kind="shape" right="24" top="20" width="120" height="80" content="rect"/>  <!-- (b) intent stored -->
<node kind="frame" layout="flex" direction="column" gap="8" width="400">
  <node kind="shape" height="40" self-align="stretch" content="rect"/>
  <node kind="text" grow="1" content="hello"/>
</node>                                     <!-- (c) -->
<node kind="group" left="100" top="50" rotation="30">…</node>   <!-- (d) -->
<node kind="shape" width="240" height="150" content="rect"
      transform="skew-x(20)"/>              <!-- (e) no wrapper needed; also no tree visibility -->
```

Flat attributes are XML-native — B arguably reads _best of the three_ at
rest. The illegibility risk is different: nothing in the tree marks node (e)
as exotic, and a sheet can carry dormant properties invisible to a reader
who doesn't know the rulebook.

## 8. Encoding sketch (H9)

Two honest options, both with costs:

1. **Wide optional table** — one FlatBuffers table, ~40 nullable
   table/union fields. Encodable, statically typed, additive. It is exactly
   the "all-flat mega-table" the current fbs commentary (§ "union-per-variant
   rationale") argues against — adopting B means _reversing that recorded
   decision_, not sneaking past it.
2. **Registry key–value vector** — `[{prop: PropId, value: PropValue-union}]`.
   Maximally uniform (mirrors the mutation protocol), but loses static field
   typing and pays a union dispatch per property.

v1 recommendation within B: option 1 (typed, tooling-friendly), with the
mutation protocol living above the encoding.

## 9. Harness scorecard

| harness          | verdict                   | note                                                                                                               |
| ---------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| H1 readability   | **pass**                  | best-of-three attribute ergonomics; risk = dormant props + unmarked exotic transforms                              |
| H2 gestures      | **pass**                  | uniform triples; every write legal (no typed errors — conflicts arbitrated instead)                                |
| H3 CRDT          | **pass+**                 | per-property LWW over one op type; the uniformity is unmatched. Gesture-coupling caveat same as A                  |
| H4 layout        | **pass w/ named lie**     | single-pass, transforms excluded; rotated in-flow child _overlaps_ — defined but violates canvas-truth expectation |
| H5 single source | **trade**                 | dormancy = defined-but-resurrecting dead intent; `kind`/`content` redundancy validator-held                        |
| H6 coverage      | **pass at high cost**     | the rulebook is the product; ~40-row normative registry, CSS-scale authorship burden                               |
| H7 animation     | **pass+ (best of three)** | scalar channels native, all compositor-lane, CSS animation model maps 1:1; _no_ layout-coupled motion lane         |
| H8 capability    | **pass**                  | full transform stack incl. 3D on every node; no quarantine — capability is ambient (and invisible, see H1)         |
| H9 encoding      | **trade**                 | viable, but reverses the fbs draft's recorded union-per-variant rationale                                          |
| H10 hot loops    | **trade**                 | canonical reads are sheet lookups; dense projection is mandatory, invalidation per property-key                    |

**Where B beats A:** mutation/tooling/sync uniformity, animation, raw
attribute readability, additive evolution.
**Where B loses to A:** layout visually lies under rotation, dormancy,
rulebook mass, refusal (nothing is unrepresentable), hot-loop distance.

## 10. Deferred

Registry versioning/feature-query mechanism; percent insets; whether `kind`
can be dropped entirely (pure `content`-discriminated nodes); custom/vendor
property namespace policy.
