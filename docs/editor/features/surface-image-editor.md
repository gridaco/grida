# Surface Image Editor

The surface image editor provides on-canvas controls for repositioning image paints without leaving the canvas. When a node that is **not** a text element contains an image fill or stroke, double-clicking the node promotes the paint into a dedicated edit mode. The selection overlay fades out and the editor draws a stroked polygon that traces the transformed image bounds.

## Entering image edit mode

- Double-click a node whose fills or strokes include an image paint.
- The editor switches to `paint/image` content edit mode and shows the image outline together with interaction handles.
- Exiting content edit mode (via `Esc`, the inspector, or another double click) restores the regular selection overlay.

## Interaction model

The overlay exposes three groups of controls:

- **Translate** – dragging anywhere inside the highlighted polygon offsets the paint. Movement is resolved in the paint’s local coordinate system so the image follows the pointer even when rotated.
- **Scale** – four invisible edge rails allow resizing along the paint’s width/height axes. The active side stays perpendicular to the current transform; the opposite edge remains fixed.
- **Rotate** – circular corner handles rotate the paint around its centre. The rotation gesture keeps the distance from the centre constant, so the image neither scales nor skews while rotating.

All handles operate in canvas space. Their hit areas are transformed with the same viewport scale and node rotation as the selection, ensuring that pointer feedback matches what is rendered on screen.

## Transform reasoning

Internally the editor treats the paint transform as a 2×3 affine matrix that maps the unit image square onto the node’s local rectangle. Each gesture is reduced to a pure mathematical operation on this matrix:

- Translation adds the pointer delta to the matrix translation column.
- Side drags project the pointer movement onto the paint’s width/height vectors, keeping edits stable regardless of rotation or skew.
- Corner drags compute the signed angle between the initial and current vectors from the centre to the handle, then compose the matrix with a rotation around that centre.

Because all reductions happen in vector space, the implementation is independent of DOM events—the UI simply supplies action descriptors such as `("scale-side", right, δ)`.

## Visual feedback

The editor renders:

- A translucent polygon tracing the current image bounds.
- Subtle handles aligned with each edge and corner (they are interactive but do not add additional chrome to the design).

This feedback remains perfectly aligned with the viewport transform, so zooming or rotating the canvas does not desynchronise the overlay from the rendered image.
