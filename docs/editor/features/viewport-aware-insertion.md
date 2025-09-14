# Viewport-aware insertion

The canvas editor automatically adjusts how new nodes are placed when inserting or pasting.
This behaviour has two parts:

## Altered position

When the bounding box of the content to insert lies entirely outside the current
viewport, the editor shifts the content so that its centre aligns with the
viewport centre. This guarantees that newly inserted nodes are immediately
visible without requiring the user to pan the canvas.

## Hit-tested nested placement

If there is no explicit selection to determine the insertion target, the editor
performs a hit test at the insertion point. If the insertion rectangle is fully
contained within a container node discovered by the hit test, the content is
inserted as a child of that container. The search is limited by a configurable
maximum depth to avoid traversing excessively deep hierarchies.

When a container is selected, insertion respects the selection: the new content
is placed under the selected container, or alongside the selection if it is not
itself a container.
