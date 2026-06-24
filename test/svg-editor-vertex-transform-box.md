---
id: TC-SVGEDITOR-VECTOR-004
title: Vertex Transform Box — translate / scale / rotate a vector sub-selection
module: svg-editor
area: vector
tags:
  [
    vector,
    content-edit,
    transform-box,
    scale,
    rotate,
    translate,
    policy-class,
    history,
    undo,
  ]
status: untested
severity: medium
date: 2026-06-23
updated: 2026-06-23
automatable: false
covered_by:
  - packages/grida-svg-editor/__tests__/vertex-transform-box.test.ts
  - packages/grida-canvas-hud/__tests__/transform-box-math.test.ts
  - packages/grida-canvas-hud/__tests__/classes/transform-box/surface.test.ts
  - packages/grida-canvas-hud/__tests__/state.test.ts
  - packages/grida-svg-editor/__tests__/policy-class/tables.test.ts
---

## Behavior

While in path edit mode (`state.mode === "edit-content"`), selecting **two or
more vertices** renders a virtual **transform box** around them and binds it to
the standard HUD transform-box gestures. The box is a **vertex** tool: a
segment or tangent selection does NOT summon it (to transform an edge, select
its vertices). Those gestures
(gridaco/grida#881): drag the **body** to translate, an **edge or corner** to
scale (anchor = the opposite edge / corner), and the **ring just outside a
corner** to rotate (pivot = box center). Manipulating the box applies a single
affine to the selected vertices (and their tangents); unselected vertices are
untouched. The box handles take **priority** over the vector chrome underneath
(vertex / segment), so a corner / edge grab is never stolen by a coincident
control.

The box frame is **edit-session state**, shared across gestures (NOT reset per
gesture): a fresh selection starts as an axis-aligned bbox, but a rotate / scale
folds into the frame so the next gesture composes onto it (a scale after a
rotate runs along the rotated axes). The frame resets — back to an axis-aligned
bbox — only when the sub-selection identity changes, the geometry is edited by
something other than translating the whole selection, or content-edit exits.

The policy is always `bake` and is count- and type-preserving: a polygon stays
a polygon, a path stays a path, and no vertex is added or removed. A transform
is one undo step that restores both the geometry and the sub-selection.

The geometry, the screen→local affine, and the policy gate are unit-covered
(`covered_by`). This TC covers what only manifests through real pointer
interaction in a mounted editor: the box renders / re-renders, the gestures
apply, unselected points stay put, and the degenerate cases fall back cleanly.

## Steps

1. Mount the editor on a document containing
   `<polygon id="p" points="0,0 40,0 40,40 0,40" fill="red"/>`.
2. Double-click the polygon (or select it and press <kbd>Enter</kbd>) to enter
   path edit mode. Marquee-select (or shift-click) **two adjacent vertices**
   (e.g. the right edge: `40,0` and `40,40`).
   - Expected: a transform box renders around the two selected points; the
     two unselected points sit outside it.
3. **Scale (edge AND corner).** Drag the box's right edge outward, then a
   corner.
   - Expected: only the selected vertices move (the edge / corner stretches the
     box, anchored at the opposite edge / corner); the two unselected left
     vertices stay put; the element is still `<polygon id="p">` (NOT detached,
     NOT re-typed) and stays in edit mode. A grab on a corner / edge that sits
     on top of a vertex resizes the box (it is NOT stolen by the vertex).
4. Press <kbd>Cmd/Ctrl+Z</kbd> once.
   - Expected: a single undo restores the prior geometry **and** the two-vertex
     sub-selection.
5. **Rotate, then compose.** With the same two points selected, drag the ring
   just around / outside a corner (the corner's center scales; its surround
   rotates).
   - Expected: the box rotates about its center and the selected points rotate
     with it. On release the box **stays rotated** (the handles remain where you
     left them). Now drag an edge to scale: the scale runs along the **rotated**
     axes (the frame persists across gestures within the edit session — it is
     NOT reset to axis-aligned per gesture). The rotation resets only when you
     select a DIFFERENT set of points, edit the geometry by something other than
     moving the whole selection, or exit edit mode.
6. **Translate (body).** Select all four points; drag the box body.
   - Expected: the whole sub-selection translates uniformly; one undo step. If
     the box was rotated (step 5), the body still translates correctly and the
     box keeps its rotation. (Dragging a vertex KNOB also translates the whole
     selection and snaps with <kbd>Shift</kbd>; the box follows.)
7. **Modifiers (identical to the element box).** With ≥ 2 points selected:
   - Hold <kbd>Shift</kbd> while dragging a **corner**: the scale is aspect-
     locked (uniform). Hold <kbd>Alt</kbd>: the box scales from its **center**
     (the opposite corner moves out too). <kbd>Shift</kbd>+<kbd>Alt</kbd>
     composes (uniform-about-center).
   - Hold <kbd>Shift</kbd> while **rotating** (corner ring): the angle snaps to
     15° increments.
   - Hold <kbd>Shift</kbd> while dragging the **body**: the translate axis-locks
     to the dominant axis.
   - Toggling <kbd>Shift</kbd> / <kbd>Alt</kbd> MID-drag (without moving the
     mouse) updates the preview immediately.
8. **Path source.** Repeat steps 2–4 on
   `<path id="q" d="M0,0 L40,0 L40,40 L0,40 Z"/>` — identical behavior; the path
   stays a `<path>` and the vertex count is unchanged.
9. **Axis-aligned line.** Select two vertices that share a y (e.g. the top edge
   `0,0` and `40,0` — a collapsed vertical axis).
   - Expected: the box renders as a thin grabbable horizontal strip and supports
     **rotation** (drag a corner ring) and scale along the spanning axis;
     nothing throws (no `NaN` on the collapsed axis).
10. **Point fallback.** Select a **single** vertex (or two coincident vertices —
    both bbox axes collapse).
    - Expected: **no transform box** renders. Dragging the vertex knob still
      translates it; nothing throws and no zero-area box appears.
11. **Segment / tangent selection — no box.** With nothing else selected, click
    a **segment** (an edge between two vertices) to select it; then try a
    **tangent** handle.
    - Expected: **no transform box** renders for either — the box is a vertex
      tool. Selecting the segment's two endpoints as vertices instead DOES show
      the box.
12. **Click falls through to a point inside / at the box.** With the box showing
    (≥ 2 vertices), **click** (press + release without moving) one of the
    selected vertices — including one sitting at a box corner / edge.
    - Expected: the selection **narrows to that one vertex** (the box claims
      drags, but a click passes through to the point beneath the handle). The
      box now disappears (one vertex). <kbd>Shift</kbd>+click a selected vertex
      instead **toggles it off**. A click that turns into a drag transforms the
      box (no selection change). Free-transform / image-paint boxes (no control
      underneath) are unaffected — a click there is a no-op.
    - **Hover preview.** Before clicking, move the cursor over a selected vertex
      inside / at the box (without pressing): the vertex shows its **hover
      state** (highlight color), previewing what the click in this step would
      select — even though the box owns the pixel. Hovering the box body where
      no vertex sits shows no vertex highlight (a click there is a no-op).

## Notes

- The box frame is persistent **edit-session** state (a baseline + an
  accumulated local affine, re-baked drift-free each commit), so a rotate
  carries into the next gesture. A uniform translation of the selection (body
  drag, multi-vertex knob drag, nudge, or undo) is absorbed into the frame; any
  other edit resets it to a fresh axis-aligned box.
- All three gestures (body / edge-corner / ring) run through one
  `handle_transform_box` path; body-drag composes into the frame rather than
  detouring through the translate pipeline. Body-drag DOES axis-lock under
  <kbd>Shift</kbd> (via the reducer); point-SNAP to sibling vertices on a
  body-drag is the follow-up — vertex-knob translate still snaps.
- Modifiers are applied in the shared HUD reducer (`reduceTransformBox`), so the
  vertex box behaves identically to the element box: <kbd>Alt</kbd> = scale
  from center, <kbd>Shift</kbd> = aspect-lock a scale / snap a rotation to 15° /
  axis-lock a body translate. A mid-drag toggle re-emits immediately.
- The write routes through the shared `vector_geometry_step` commit path, so a
  transform that escapes the native form re-types to `<path>` and undoes
  byte-for-byte — see TC-SVGEDITOR-VECTOR-001. For a zero-tangent vertex-chain
  a scale / rotate keeps the tangents zero, so it stays a native
  `<polygon>` / `<polyline>` (no promotion).
- Corner = scale (anchor = opposite corner), the ring around a corner = rotate,
  edge = scale. The box handles take priority over the vector chrome; the body
  stays below vertex / tangent so individual points can still be clicked to
  refine the sub-selection. Restricting the line model to single-axis scale and
  an element-frame-aligned box for rotated elements are deferred — see
  docs/wg/feat-svg-editor/vertex-transform-box.md.
