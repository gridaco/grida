# Surface Vector Editor - Middle Point Projection

When hovering a straight segment in the vector editor, a preview point appears at the middle of the segment. Pressing and dragging on this preview splits the segment by inserting a new vertex at the midpoint and immediately begins a drag gesture for that vertex.

- Midpoint preview only appears on straight segments.
- Pointer down on the preview inserts the vertex and selects it.
- Dragging continues without releasing the pointer.
- Midpoint calculation is memoised and only recomputed when the hovered segment changes.

This behaviour mirrors conventional vector editing tools where segments can be quickly subdivided by interacting with their midpoints.
