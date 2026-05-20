# Grouping policy

`Cmd+G` wraps the current selection in a new plain `<g>` element. The
decision tree below is the contract. Default stance: **when unclear,
reject** — surface a no-op rather than silently produce invalid SVG or
unexpected paint-order changes.

Ungrouping is not implemented. See `TODO.md` §10 for the open research.

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

| Selection                                                  | Cmd+G  |
| ---------------------------------------------------------- | ------ |
| Empty                                                      | reject |
| Any selected node's tag ∉ `STRUCTURAL_GRAPHICS_SET`        | reject |
| Common parent's tag ∈ `CONSTRAINED_PARENT_SET`             | reject |
| Selection includes the document root                       | reject |
| ≥2 nodes with mixed parents                                | reject |
| ≥2 nodes, same parent, **non-contiguous** in element order | reject |
| 1 node, valid tag, unconstrained parent                    | wrap   |
| ≥2 nodes, same parent, contiguous, unconstrained parent    | wrap   |

The single-node case is not gated on "is the tag `<g>`." A single `<g>`
is a valid wrap target (the user gets a nested group, which is sometimes
what they want); a single `<rect>` is also valid; a single `<tspan>` is
rejected because its tag is not in `STRUCTURAL_GRAPHICS_SET`. The axis
is the tag's content-model role, not its identity.

Non-contiguous selections are rejected even when they share a parent:
wrapping non-contiguous siblings in a `<g>` rearranges paint order
relative to the unselected siblings between them. Users who want this
can group contiguous runs separately.

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

## What this is not

- Not a flatten / ungroup operation. See `TODO.md` §10 for why
  ungrouping is fundamentally different.
- Not an LCA computation. Cross-parent selections are rejected, not
  lifted to a common ancestor.
- Not a multi-node transform tool. The HUD's multi-group chrome is a
  separate work item (`TODO.md` §1).
