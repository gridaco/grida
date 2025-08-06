# Surface Vector Editor - Middle Point Projection

When hovering a straight segment in the vector editor, a preview point appears at the middle of the segment. Pressing and dragging on this preview splits the segment by inserting a new vertex at the midpoint and immediately begins a drag gesture for that vertex.

- Midpoint preview only appears on straight segments.
- Pointer down on the preview inserts the vertex and selects it.
- Dragging continues without releasing the pointer.
- Midpoint calculation is memoised and only recomputed when the hovered segment changes.

This behaviour mirrors conventional vector editing tools where segments can be quickly subdivided by interacting with their midpoints.

# Copy and Paste

Selections in vector edit mode can be copied and pasted across windows using the system clipboard. When the editor is not in vector edit mode, pasting inserts the copied network as a new vector node. Cutting and translating with clone are not yet supported.

# Clearing Selection

Clicking on an empty area while editing a vector clears any selected vertices, segments or tangents. Hold `Shift` to preserve the current selection.

# Marquee and Lasso Selection Priorities

Dragging a rectangular marquee selects vertices and segments with a priority on
vertices. To select a vertex, simply drag the marquee over it. Selecting a
segment requires dragging over the segment while **excluding** both of its
endpoints; if either endpoint is inside the marquee, only the vertex is
selected and the segment is ignored. When an already selected segment later has
one of its vertices captured by the marquee, the segment selection is cancelled
in favour of the vertex.

Curved segments are tested with `cmath.bezier.intersectsRect`, allowing accurate
segment selection without expensive curve–polygon comparisons. Lasso selections
only target vertices and tangents for performance reasons.

# Translate Vector Controls

The `translate-vector-controls` gesture moves selected vertices and tangents while respecting their dependencies. When dragging any active part of the selection—vertices, tangents or segments—the entire selection translates as a single unit.

Given a selection consisting of segments `S`, vertices `V` and tangents `T` (where each tangent is `[vertex, 0|1]` for `ta`/`tb`):

1. Build the vertex set `V'` by adding the `a` and `b` vertices of each segment in `S` and all vertices in `V`.
2. Build the tangent set `T'` by including tangents from `T` whose vertex is not in `V'`.

Moving by a delta `d = (dx, dy)` results in

- `p_i ← p_i + d` for every vertex index `i` in `V'`.
- `t_{i,k} ← t_{i,k} + d` for every tangent `[i,k]` in `T'` where `k` is `0` for `ta` and `1` for `tb`.

Tangents associated with a moved vertex become no-ops, as the vertex movement already offsets them.

This encoding makes translating mixed selections predictable and easy to test.

# Tangent Mirroring Modes

The editor supports several modes for mirroring tangent handles of connected Bézier segments:

- `none` – moving one tangent does not affect the other.
- `angle` – only the angle is mirrored; each tangent keeps its own length.
- `all` – both angle and length are mirrored.
- `auto` – infers the current relationship of the tangents and mirrors accordingly. When the tangents are perfectly mirrored it behaves like `all`; when only the angle matches it mirrors the angle; otherwise no mirroring occurs.

# Bend Tool

The **bend** tool adjusts the curvature at a vertex:

- Clicking a sharp corner assigns mirrored tangents based on the angle bisector.
- If both tangents already exist, clicking removes them, restoring the sharp corner.
- If only one tangent exists, clicking mirrors its length and direction onto the missing side.
- Dragging deletes existing tangents and begins a freeform curve gesture.
