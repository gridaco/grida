# Geometry — coordinate spaces and the `GeometryProvider` layer

This doc covers the world-space geometry layer of `@grida/svg-editor`:
the coordinate-space conventions, the `GeometryProvider` contract, the
cache invariants, and the v1 limitations.

For the bug that motivated this layer, see the alt-key measurement
section at the end.

## Three coordinate spaces

The package distinguishes three spaces. Pin these once, and every
"which space is this number in?" question becomes mechanical.

| Space         | Units              | What lives here                         | API surface                          |
| ------------- | ------------------ | --------------------------------------- | ------------------------------------ |
| **world**     | SVG-author coords  | `viewBox` rect, `x`/`y`/`d`, snap       | `GeometryProvider.bounds_of(id)`     |
| **container** | CSS px (post-zoom) | HUD chrome, draw geometry, hit-tests    | surface-internal `container_box(id)` |
| **viewport**  | CSS px (page)      | Browser events, `getBoundingClientRect` | input boundary only                  |

Only **world** crosses package boundaries. Container space is private
to the surface; viewport space is converted out at the boundary.

## Camera invariant

The camera applies as a **CSS `transform: matrix(...)` on the `<svg>`
root**. SVG-internal coordinates are never touched.

This is the structural property that makes the geometry layer fast and
correct:

- `getBBox()` returns the element's bbox in its own SVG coord space,
  independent of CSS.
- `getCTM()` (the local→nearest-viewport matrix) **does not include
  CSS transforms on the root**. So for any descendant of the `<svg>`
  root, `getCTM` composed with `getBBox` returns **world-space**
  bounds directly — no reverse-scaling, no rounding drift.

Camera v1 is uniform-scale + translate. Rotation is not exposed.

## `GeometryProvider`

```ts
interface GeometryProvider {
  bounds_of(id: NodeId): Rect | null;
  bounds_of_many(ids: ReadonlyArray<NodeId>): Map<NodeId, Rect>;
  nodes_in_rect(rect: Rect): NodeId[];
  node_at_point(p: Vec2): NodeId | null;
  world_delta_to_local?(id: NodeId, delta: Vec2): Vec2;
}
```

- Lives at [`src/core/geometry.ts`](../src/core/geometry.ts). Pure types —
  zero DOM imports.
- The concrete driver (`SvgGeometryDriver`) lives in
  [`src/dom.ts`](../src/dom.ts) and reads `getBBox` + `getCTM`.
- The driver is wrapped in a `MemoizedGeometryProvider` decorator that
  caches per-`NodeId` and invalidates on either `structure_version` or
  `geometry_version` change.
- Exposed publicly as `editor.geometry` — `null` until a surface
  attaches. Snap and the size meter consume this; they do **not**
  import `dom.ts`.

`bounds_of_many` ships as part of the day-one API: consumers like snap
need to read 50+ bounds per pointermove, and a bulk-query shape gives
the driver room to batch.

## Version-bump discipline

| Counter             | Bumps on                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `structure_version` | tree shape changes, `id` writes, `set_text`                                                         |
| `geometry_version`  | tree shape changes, `set_text`, writes to attributes in `GEOMETRY_ATTRS`, and DOM font-load settle† |
| `revision`          | every mutation (including presentation writes)                                                      |

All three live on `SvgDocument`. `revision` is the total order —
surfaced as `EditorState.content_version`, it derives `dirty`, keys the
typed-read memo caches, and gates the DOM surface's render flush (see
§Flush-on-read below).

`GEOMETRY_ATTRS` is the closed set of attribute names whose writes can
shift bounds — `x`, `y`, `width`, `d`, `transform`, `font-size`, etc.
See [`src/core/document.ts`](../src/core/document.ts) for the full list.

† The **one** `geometry_version` bump with no attribute write: a DOM
font-load settle (`document.fonts` `loadingdone`). The DOM surface drives
it through `editor._internal.bump_geometry()` →
`SvgDocument.bump_geometry()`, which advances `geometry_version` only — it
does **not** bump `structure_version` / `revision`, mark the doc dirty,
or touch undo (a reflow is not an edit). See §Limitations "Text bbox
depends on font".

The `MemoizedGeometryProvider` subscribes to both `structure_version`
and `geometry_version` and clears its cache on either. It does **not**
subscribe to `revision` — a fill-color change does not invalidate
bounds.

## Why caching is load-bearing

The DOM surface re-renders the entire `<svg>` root whenever the doc
changed (it calls `editor.serialize()` and `replaceWith`s the result;
the rebuild is gated on `revision`, so emits that carry no doc change
— selection, tool — skip it). Every re-render replaces the DOM
elements that `getBBox`/`getCTM` would read from.

For idle editing this is fine — the rebuild only happens on doc
mutation. But during a drag, snap queries 50+ candidate node bounds
per pointermove against a freshly-mounted tree, and without caching
each call forces a synchronous layout flush. The memoizer makes the
first read of a frame pay the layout cost; subsequent reads in the
same frame are O(1).

The cache is keyed on `NodeId`, not on DOM element references —
elements are replaced on every re-render, but ids persist.

## Flush-on-read — reads never observe a stale render

Doc listeners (`subscribe_geometry`, `editor.subscribe`) fire
synchronously inside the mutation — before the surface's render
listener has projected the new attrs into the live DOM. A geometry
read issued from such a listener (a React `useSyncExternalStore`
bounds hook, say) would otherwise read the PREVIOUS document's
layout — and because the memoizer caches whatever the driver
returns, that one stale read poisons every later consumer until the
next invalidation: repeated `align` re-applies the previous delta
and the selection oscillates instead of settling.

So the driver flushes before every live-DOM read: each
`SvgGeometryDriver` method (and the `getComputedStyle`-backed
computed resolver) first calls the surface's `flush_dom()`, which
re-renders iff `revision` is ahead of the last-rendered revision.
Same model as CSS layout — reading `offsetWidth` flushes pending
layout; reading `bounds_of` flushes the pending render. The contract
is stated on the `GeometryProvider` interface (any future driver
backed by a lazily-synced projection must honor it); the regression
suite is
[`geometry-stale-read.browser.test.ts`](../__tests__/geometry-stale-read.browser.test.ts).

## Show/hide uses `visibility`, not `display`

Layer show/hide writes `visibility="hidden"`, never `display:none`.
`display:none` removes the element from the render tree, which nulls
out `getBBox`/`getScreenCTM` and makes `elementFromPoint` miss it — so
hidden nodes would become un-pickable and un-transformable, and snap
geometry against them would break. `visibility:hidden` keeps the node
in the tree (invisible but still laid out and query-able), so those
DOM queries keep working.

Known limitation (accepted, to revisit): `visibility` inherits, so a
hidden group is not airtight — a descendant with `visibility:visible`
escapes it, and "show" on a node that only _inherits_ its hidden state
writes `null` and is a no-op until that escaping case is handled.
`display:none` would be airtight but is disqualified above. The toggle
lives in the editor inspector (`VisibilityToggle`); the snap filter
(`core/snap/neighborhood.ts`) already gates on both `display="none"`
and `visibility="hidden"`.

## Limitations (v1)

These are documented as known-broken rather than fixed in v1:

- **Nested `<svg>`.** `getCTM()` stops at the nearest viewport. A
  descendant of an inner `<svg>` returns coordinates in the
  inner-svg's space, not the document root. `SvgGeometryDriver` does
  not currently walk `ownerSVGElement` to compose CTMs up to the root.
  Flagged with `// TODO: nested-svg` in
  [`src/dom.ts`](../src/dom.ts).
- **`<foreignObject>`.** `getBBox()` returns the declared `x/y/width/
height` frame, not the inner HTML's actual layout. Bounds reflect
  the frame; visible HTML content overflow is not queryable.
- **Text bbox depends on font.** `<text>` and `<tspan>` bboxes shift
  when a web font finishes loading AFTER its `font-family` / `font-size`
  was already written — a reflow the IR cannot see, so nothing in the
  document bumps `geometry_version`. The **DOM surface** closes this for
  the common case: it listens to the container's `document.fonts`
  `loadingdone` event (and an initial `fonts.ready`) and advances the
  geometry channel via `editor._internal.bump_geometry()`, clearing the
  bounds cache so snap / HUD chrome / the size meter re-read at the
  settled glyph metrics. Honest caveats: (1) the bump is **coarse** — one
  settle clears the **whole** cache, not just the reflowed text runs
  (consistent with the pessimistic-invalidation stance below); (2) it is
  **DOM-surface only** — non-DOM geometry providers, and fonts loaded
  outside `document.fonts` (a `FontFace` added to a different set, or a
  raw `@font-face` the document never observes), are NOT auto-observed. A
  public `invalidate_geometry()` for those cases is **deferred**, not
  shipped.
- **Pessimistic invalidation.** Same-value attribute writes still
  bump `geometry_version`. The cache treats every bump as "clear
  everything." Subtree-targeted invalidation is a follow-up when
  profiling shows it matters.

## Why this exists — the alt-measure bug

At zoom ≠ 1, the alt-key measurement HUD used to report screen-space
sizes (post-CSS-transform) instead of world-space sizes (what the user
authored). The root cause was that the surface had two geometry
helpers — `container_box` (screen) and `node_world_bounds` (world) —
and the measurement code was using the screen-space one for the
reported numbers as well as the visual layout.

The fix splits the two: container rects still drive the HUD's pixel
visual (so chrome stays 1 px sharp), but the distance labels are
overwritten with `GeometryProvider.bounds_of(...)` results so the
reported numbers are what the document actually contains.

This decoupling is also what makes the rest of the geometry layer
work: every world-space consumer (size meter, snap, copy-as-svg
bounds queries) routes through the provider, never through
`getBoundingClientRect` arithmetic.
