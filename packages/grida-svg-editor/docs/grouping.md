# Grouping policy

`Cmd+G` wraps the current selection in a new plain `<g>` element. The
decision tree below is the contract. Default stance: **when unclear,
reject** — surface a no-op rather than silently produce invalid SVG or
unexpected paint-order changes.

`Cmd+Shift+G` ungroups a plain structural `<g>` — the **safe
clean-structural subset** only. See [Ungrouping policy](#ungrouping-policy)
below and `TODO.md` §10 for the full research on why ungrouping is not the
inverse of grouping.

## Element sets

A node is a valid `<g>` child if its tag is in
`STRUCTURAL_GRAPHICS_SET`:

```
g, defs, svg, use, image, switch, foreignObject,
path, rect, circle, ellipse, line, polyline, polygon, text, a
```

A parent is "constrained" — and cannot host a freshly-inserted `<g>`
without breaking semantics or producing invalid SVG — if its tag is in
`CONSTRAINED_PARENT_SET`:

```
text, tspan, defs, clipPath, mask, pattern, marker, symbol, filter,
linearGradient, radialGradient, animateMotion, switch
```

These parents either constrain their content model (e.g. `<text>` can
only contain text-content children; `<linearGradient>` only allows
`<stop>`) or define non-canvas containers (`<defs>`, `<symbol>`).

## Decision table

| Selection                                                 | Cmd+G  |
| --------------------------------------------------------- | ------ |
| Empty                                                     | reject |
| Any selected node's tag ∉ `STRUCTURAL_GRAPHICS_SET`       | reject |
| Common parent's tag ∈ `CONSTRAINED_PARENT_SET`            | reject |
| Selection includes the document root                      | reject |
| ≥2 nodes with mixed parents                               | reject |
| 1 node, valid tag, unconstrained parent                   | wrap   |
| ≥2 nodes, same parent, unconstrained parent (any z-order) | wrap   |

The single-node case is not gated on "is the tag `<g>`." A single `<g>`
is a valid wrap target (the user gets a nested group, which is sometimes
what they want); a single `<rect>` is also valid; a single `<tspan>` is
rejected because its tag is not in `STRUCTURAL_GRAPHICS_SET`. The axis
is the tag's content-model role, not its identity.

A same-parent selection wraps **regardless of adjacency** — wrapping a
`<rect>` together with a `<g>` is the same operation as wrapping two
`<rect>`s. Non-contiguous siblings are **gathered** into the new `<g>` in
document order; the group lands at the front-most selected sibling's
z-position and any unselected siblings that sat between selected ones
drop behind it. That paint-order rearrangement is exactly what grouping
non-adjacent elements means (matches Figma / Illustrator), and it
round-trips byte-exactly on undo via the per-child position capture
below. The only same-parent rejections are an empty selection, the
document root, a constrained parent, or a non-structural tag. Mixed
parents stay rejected (which parent would host the new `<g>`, and at what
z-position, is ambiguous).

## Wrap algorithm

When the plan is accepted:

1. The new `<g>` is inserted at the position of the topmost-by-document-
   order selected sibling. Its `next_element_sibling_of` is captured and
   used as the `insert_before` anchor.
2. Selected children are moved into the new `<g>` in document order
   (not selection order).
3. The new `<g>` is created with no attributes — in particular, no
   auto-generated `id`. SVG renders a plain `<g>` as a structural
   container without disturbing inherited presentation.

## Undo guarantees

Undo restores the **element tree** exactly: every previously-selected
node returns to its original parent at its original
`next_element_sibling_of` anchor, and the new `<g>` is detached from
the tree.

**Byte-equal serialization is guaranteed only for input that has no
inter-element whitespace.** The parser preserves inter-element
whitespace as text nodes in the document; the wrap algorithm moves only
element nodes into the new `<g>`. Surrounding whitespace text nodes
stay in the original parent and are not migrated into the group. This
produces cosmetic shifts (e.g. extra leading indent where two elements
vacated; no whitespace inside the new `<g>`). The element tree is
exact; the serialized bytes are not.

V2 may migrate whitespace into the group for a tighter undo guarantee.
For v1 this is documented and accepted.

## Selection state

After a successful group: the new `<g>` is the sole selection. Undo
restores the original selection.

## Ungrouping policy

`Cmd+Shift+G` (`commands.ungroup`) dissolves the selected `<g>`, hoisting
its children into the group's parent at the group's z-position, in
document order. The new selection is the former children. One atomic
history step — undo restores the group, its children, and their
transforms byte-equal.

Ungrouping is **not** the inverse of grouping when the group carries
visual / cascade / reference state, so the gate
(`core/group.ts:plan_ungroup`) accepts only the safe clean-structural
subset. It **accepts** a `<g>` when ALL hold:

- The target is a single `<g>` (not the document root).
- The group is NOT inside `<defs>` (any ancestor `<defs>` → refuse).
- The group has **at least one** element child.
- The group's own attributes are a subset of
  `{ transform, id, data-grida-id }`.
- The group's `id` (if any) is NOT referenced by any `<use>`
  (`href` / `xlink:href === "#<id>"`).
- No direct child is an SVG animation element (`animate` /
  `animateTransform` / `animateMotion` / `set`).
- If the group has a `transform`, every child's own `transform` parses.

It **refuses** (no-op, no history) any group carrying visual state —
`opacity`, `filter`, `clip-path`, `mask`, `class`, `style`, or an
inherited presentation attribute (`fill`, `stroke`, `font-*`, …) — along
with `<defs>` groups, `<use>`-referenced groups, animation-bearing
groups, empty groups, and unbakeable transforms. These cases would
change rendering semantics; the package refuses them rather than
silently mishandle them. A destructive "flatten group" command that
attempts per-child opacity / filter / cascade preservation is a separate
deferred item (`TODO.md` §10).

### Transform bake

When the group has a `transform`, it is baked into each child by
**prepending** the group's parsed ops to the child's parsed ops and
re-emitting clean tokens — e.g. group `translate(10 20)` + child
`rotate(5)` → child `translate(10 20) rotate(5 0 0)`. A child with no
transform inherits the group's transform verbatim. This is an op-list
compose, **not** a `matrix(...)` collapse: SVG applies transform lists
left-to-right, so the group's ops must lead the child's to preserve
visual order, and clean tokens stay human-readable and round-trip
through the parser without trig drift.

## What this is not

- Not a destructive flatten. `ungroup` handles only the clean-structural
  subset; the per-child opacity / filter / cascade-preservation
  "flatten group" remains deferred (`TODO.md` §10).
- Not an LCA computation. Cross-parent selections are rejected, not
  lifted to a common ancestor.
- Not a multi-node transform tool. The HUD's multi-group chrome is a
  separate work item (`TODO.md` §1).
