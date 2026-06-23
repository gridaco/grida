---
"@grida/hud": minor
"@grida/svg-editor": minor
---

Vector sub-selection transform box ([#881](https://github.com/gridaco/grida/issues/881)). In path edit mode (`mode === "edit-content"`), selecting **two or more vertices** now renders a transform box that **translates**, **scales** (edge or corner, anchored at the opposite edge/corner), and **rotates** the selected vertices and their tangents via a single affine — with the same handles, `Shift` (aspect-lock / 15° rotation snap / body axis-lock) and `Alt` (scale-from-center) modifiers as the element transform box. The box is a vertex tool (a segment- or tangent-only selection does not summon it) and applies the `transform-vertices` policy-class sub-intent: always `bake`, count- and type-preserving (a polygon stays a polygon, a path stays a path), one undo step.

The box frame is **edit-session state**, shared across gestures: a rotation carries into the next gesture and reconciles to the geometry (a uniform translation of the selection is absorbed; any other edit resets it to a fresh axis-aligned box). The box claims drags while the vector control beneath each handle stays **click-selectable** — a click narrows/toggles the point underneath, and it **lights up on hover** to preview that selection.

`@grida/hud`'s transform box gains a `corner_role: "scale"` mode (inner scale knob + outer rotate ring), per-handle `priority` overrides, a `scale_corner` op, and `Shift`/`Alt` modifier support in `reduceTransformBox`. A selectable control beneath a box handle now defers to it uniformly for both click-through and hover-preview.
