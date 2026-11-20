---
"@grida/svg-editor": minor
"@grida/hud": minor
---

Point measurement in path edit ([#845](https://github.com/gridaco/grida/issues/845)). In path edit mode (`mode === "edit-content"`), holding **Alt** and hovering now measures from the vector sub-selection to a **point**, drawn with the same red distance guides used between objects: to the hovered **vertex**, or to the point on the hovered **segment** nearest the cursor (tracking the cursor along the curve). Previously path edit still measured element bounding boxes.

The behavior follows the Grida Canvas vector-network measurement ([`docs/editor/features/vector-network-measurement.md`](https://github.com/gridaco/grida/blob/main/docs/editor/features/vector-network-measurement.md)): one selected vertex measures as a point, several as their bounding box, and a segment-only selection measures from its endpoints. A hovered vertex that is selected, or is an endpoint of a selected segment, is not measured. Region measurement is out of scope (svg-editor has no face model). Guides are drawn in screen space and labelled with world-space distances, so they stay correct under camera zoom and element or ancestor transforms.

`@grida/hud`'s `Surface` gains a read-only `vectorHover()` accessor — the vector control under the pointer, the same value the vector chrome uses for its hover affordances.
