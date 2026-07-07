# Editor experience — the operation catalog

"How do you do X → what happens." Every editor operation, model-agnostic,
as **gesture → writes → effect → ripple**:

- **writes** — exactly which document fields change, on which nodes (the H2
  probe, fulfilled per-op). Phrased in `anchor` vocabulary where a concrete
  field name is needed; `sheet` equivalents are the corresponding
  properties. **FORK** marks where finalists diverge.
- **effect** — the resolved-geometry change on the target.
- **ripple** — who _else_ moves (siblings reflow, parents re-hug, measured
  ancestors re-fit).

IDs are stable (`OP-*`); each becomes a manual TC in `test/` when the
winner lands, and conformance rows reference them.

## Doctrine — six laws every operation obeys

1. **Gestures write intent; the engine resolves.** No gesture ever writes a
   resolved value into the document. Screen-space deltas are transformed
   (camera⁻¹, then parent-world⁻¹) into parent-space field writes.
2. **One gesture = one undo step = a named set of field writes.** The write
   set is part of the op's spec (this catalog), not an implementation
   detail. (Merge granularity note: a gesture's writes are fields — C-5's
   "half a drag merges valid-but-uncompound" is accepted and documented.)
3. **State→intent capture is gesture-only.** Exactly three op families are
   sanctioned to read _resolved_ geometry and capture it into new intent:
   re-anchoring (OP-INSPECT-4), layout attach/detach (OP-LAYOUT-1/2), and
   ungroup/bake (OP-TREE-2). The engine itself never does this. Everything
   else writes deltas to existing intent.
4. **Layout-owned fields redirect, never no-op.** A gesture aimed at a
   layout-owned field either redirects to its flow meaning (drag = reorder)
   or surfaces the detach affordance — silent swallowing is banned (H12).
5. **Mode switches use switch-memory** (where flattening (b) is adopted):
   the displaced value is retained and restored on toggle-back (M-3).
6. **Multi-selection = the same gesture applied per node** (independent
   write sets, one undo step). No transient group node is created.

---

## 1. Create (`OP-CREATE-*`)

| id          | how                                                        | writes                                                                                                          | effect / ripple                            |
| ----------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| OP-CREATE-1 | drag out a shape on free canvas                            | new node: parent, order, x/y = pin(start, drag-origin in parent space), w/h = fixed(drag extent), payload       | appears under cursor; no ripple            |
| OP-CREATE-2 | single click place                                         | same, with kind-default size                                                                                    | —                                          |
| OP-CREATE-3 | drag out _inside a flex frame_                             | new node + `flow: InFlow`, order = insertion index from pointer (gap highlight); x/y not written (layout-owned) | siblings make room; parent re-hugs if auto |
| OP-CREATE-4 | drop an image file                                         | new `image` node; size = intrinsic px (clamped by policy); placement as OP-CREATE-1/3                           | —                                          |
| OP-CREATE-5 | draw a text box (drag = fixed width) vs click (auto width) | width mode differs by gesture: drag → fixed(w), click → auto                                                    | click-text grows as typed (OP-CONTENT-1)   |

## 2. Move (`OP-MOVE-*`)

| id        | how                                       | writes                                                                                                                                                  | effect / ripple                                                                                                                               |
| --------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| OP-MOVE-1 | drag a free node                          | x.offset, y.offset (2 fields) — rewritten so resolved position tracks the pointer, whatever the anchor (end-anchored: the _end offset_ is what changes) | node follows; no ripple                                                                                                                       |
| OP-MOVE-2 | drag an **in-flow** child                 | **order** (fractional index, 1 field) — drag is reorder, per doctrine 4; x/y untouched                                                                  | siblings shuffle; drop-gap preview                                                                                                            |
| OP-MOVE-3 | drag in-flow child _out_ of its container | parent, order, flow→(free), x/y captured from resolved drop point (doctrine 3, via OP-LAYOUT-2 semantics)                                               | old siblings close the gap; old parent re-hugs                                                                                                |
| OP-MOVE-4 | drag free node _into_ a flex container    | parent, order (insertion index); x/y become layout-owned (retained per switch-memory)                                                                   | new siblings make room                                                                                                                        |
| OP-MOVE-5 | arrow-key nudge (±1 / shift ±10)          | x.offset or y.offset — deltas in **screen axes**, transformed to parent space (a nudge of a rotated node's child still moves it visually right)         | —                                                                                                                                             |
| OP-MOVE-6 | drag a rotated node                       | same as OP-MOVE-1 — pointer delta through parent-world⁻¹; rotation does not complicate a move (center pivot: translation and rotation commute)          | —                                                                                                                                             |
| OP-MOVE-7 | drag multi-selection                      | per node: its own 2 offsets (doctrine 6)                                                                                                                | mixed free/in-flow selection: free members move, in-flow members reorder — or policy: in-flow members require detach; **POL, locked in spec** |
| OP-MOVE-8 | shift-drag (axis lock)                    | 1 field (the unlocked axis)                                                                                                                             | —                                                                                                                                             |

## 3. Resize (`OP-SIZE-*`)

The richest family. Pivot doctrine (center) determines write counts.

| id         | how                                               | writes                                                                                                                                                                                   | effect / ripple                                                                                                      |
| ---------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| OP-SIZE-1  | corner handle, free unrotated node                | w, h, **and** x.offset, y.offset (4 fields) — opposite corner stays fixed, so the center moves and position must compensate                                                              | —                                                                                                                    |
| OP-SIZE-2  | edge handle                                       | 1 size + 1 offset (2 fields)                                                                                                                                                             | —                                                                                                                    |
| OP-SIZE-3  | **alt-resize (from center)**                      | w, h only (2 fields) — center pivot means no compensation. The cheapest resize is the symmetric one; that asymmetry is a feature of center-pivot, worth teaching in UI                   | —                                                                                                                    |
| OP-SIZE-4  | shift-resize (aspect lock)                        | as OP-SIZE-1 with both sizes coupled by current ratio (aspect_ratio field itself untouched — it is intent, not a gesture artifact)                                                       | —                                                                                                                    |
| OP-SIZE-5  | **resize a rotated node**                         | 4 fields — handles track the node's local orientation; the world-fixed point is the opposite corner: `new_center = fixed_corner_world + R(θ)·(±w′/2, ±h′/2)`; x/y compensate accordingly | free: no ripple; in-flow: **FORK** — `anchor`: siblings re-space to the new rotated AABB; `sheet`: no sibling motion |
| OP-SIZE-6  | resize an in-flow child                           | w/h intent (+ mode switch if it was auto/fill → fixed, memory retained)                                                                                                                  | siblings reflow; parent re-hugs                                                                                      |
| OP-SIZE-7  | resize a **hug** (auto) container by handle       | width/height mode → fixed(value); prior auto retained (M-3)                                                                                                                              | children unaffected unless stretch-aligned                                                                           |
| OP-SIZE-8  | resize a **container** with anchored children     | container w/h (+offsets per OP-SIZE-1) — **zero writes to children**; their bindings re-resolve (end-pinned stays 24 from the right, spanned stretches)                                  | children move/stretch _by resolution, not by write_ — the model's core payoff made visible                           |
| OP-SIZE-9  | resize a **group** (derived box)                  | writes to **all descendants**: sizes and offsets scaled proportionally (the one inherently multi-node resize; group node itself: at most x/y/θ)                                          | POL: whether strokes/text scale = separate scale-tool semantics (OP-SIZE-10)                                         |
| OP-SIZE-10 | scale tool (K)                                    | as OP-SIZE-9 plus payload-level scaling (stroke widths, font sizes) per declared scale-tool policy                                                                                       | POL                                                                                                                  |
| OP-SIZE-11 | resize past zero (drag through the opposite edge) | flip behavior: **POL** — clamp at 0, or flip (writes flip representation per R-E5)                                                                                                       | —                                                                                                                    |
| OP-SIZE-12 | resize text box                                   | width → fixed (wrap constraint); height typically stays auto — mode switches with memory                                                                                                 | re-wrap; hug ancestors re-fit                                                                                        |

## 4. Rotate (`OP-ROT-*`)

| id       | how                                   | writes                                                                                                                                                                            | effect / ripple                                                                                                                                         |
| -------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OP-ROT-1 | rotation handle, free boxed node      | **θ only (1 field)** — center pivot means the box center is invariant; no compensation                                                                                            | free: none. **This is the model's cleanest gesture**                                                                                                    |
| OP-ROT-2 | rotate an **in-flow** child           | θ (1 field)                                                                                                                                                                       | **FORK — the deciding question live**: `anchor`: siblings re-space to the rotated AABB, parent re-hugs; `sheet`: nothing else moves, overlap is correct |
| OP-ROT-3 | rotate a **group / derived-box node** | θ + x, y (3 fields) — stored pivot is the node's origin; gesture pivots at the visual center and compensates position (the legible-scalar version of Figma's matrix compensation) | children: **zero writes** (D-2/D-3)                                                                                                                     |
| OP-ROT-4 | rotate multi-selection                | per node: θ + x/y compensation, orbiting the **selection** center                                                                                                                 | one undo step; each node's writes independent                                                                                                           |
| OP-ROT-5 | shift-rotate                          | θ snapped to 15° increments                                                                                                                                                       | —                                                                                                                                                       |
| OP-ROT-6 | numeric rotation in inspector         | θ (1 field), pivot = own center — **note**: differs from OP-ROT-4's selection-center orbit; the discrepancy is standard (Figma does the same) and is declared, not accidental     | —                                                                                                                                                       |
| OP-ROT-7 | reset rotation (0)                    | θ = 0; position untouched (center invariant)                                                                                                                                      | in-flow: AABB shrinks back → siblings close in (`anchor`)                                                                                               |

## 5. Hierarchy (`OP-TREE-*`)

| id        | how                                            | writes                                                                                                                                                       | effect / ripple                                                                                                                           |
| --------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| OP-TREE-1 | group selection (⌘G)                           | new group node (parent, order, x/y/θ); each member: parent → group, geometry re-expressed in group space (offsets rewritten; world position preserved — M-5) | visual: nothing moves                                                                                                                     |
| OP-TREE-2 | ungroup (⌘⇧G)                                  | group θ/position baked into each child's fields (doctrine 3); children reparent to grandparent; group deleted                                                | nothing moves (D-4); winding/precision per N-3                                                                                            |
| OP-TREE-3 | wrap in frame                                  | as OP-TREE-1 with a `frame` (declared size = selection AABB)                                                                                                 | —                                                                                                                                         |
| OP-TREE-4 | reparent by drag (into a non-layout container) | parent, order; x/y rewritten so world position holds (M-5 declared semantics)                                                                                | nothing moves                                                                                                                             |
| OP-TREE-5 | reorder in layers panel / bring-to-front       | order only                                                                                                                                                   | paint order changes; geometry untouched — in flex parents, order is _also_ flow order: **the same field means both**; declared and tested |
| OP-TREE-6 | delete                                         | node (+subtree) removed                                                                                                                                      | flex siblings close the gap; hug parents re-fit; (future `wire`: dangling-referent fallback fires)                                        |

## 6. Layout (`OP-LAYOUT-*`)

| id          | how                                  | writes                                                                                                                                                                       | effect / ripple                                                                                  |
| ----------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| OP-LAYOUT-1 | **add auto-layout** to a frame       | frame: layout mode/direction/gap (inferred from current child geometry); children: flow=InFlow, order = sort by axis position; children's x/y become layout-owned (retained) | ideally nothing moves on the first frame — inference quality is a UX metric, not a model concern |
| OP-LAYOUT-2 | **remove auto-layout**               | frame: layout mode → none; each child: x/y captured from _resolved_ positions (doctrine 3 — the sanctioned bake moment)                                                      | nothing moves; intent is re-materialized                                                         |
| OP-LAYOUT-3 | toggle a child absolute ↔ in-flow    | child flow field; on →absolute: x/y captured from resolved (doctrine 3); on →in-flow: x/y owned again (retained)                                                             | siblings reflow around the departure/arrival                                                     |
| OP-LAYOUT-4 | drag the gap handle / padding handle | gap or padding (1 field)                                                                                                                                                     | all children re-space                                                                            |
| OP-LAYOUT-5 | "fill container" button              | main axis: grow = 1 (+ basis per policy); cross axis: self_align = stretch — the UI concept maps to two model mechanisms; the button hides that, the spec doesn't            | siblings share remaining space                                                                   |
| OP-LAYOUT-6 | "hug contents" button                | size mode → auto (fixed value retained)                                                                                                                                      | parent chain may re-hug                                                                          |
| OP-LAYOUT-7 | reorder within flow by drag          | order (see OP-MOVE-2)                                                                                                                                                        | —                                                                                                |

## 7. Inspector — numeric & mode writes (`OP-INSPECT-*`)

| id           | how                                                        | writes                                                                                                                                                                     | effect / ripple                                                                                 |
| ------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| OP-INSPECT-1 | type X (or Y)                                              | the axis offset, **re-targeted**: whatever the anchor, the offset is rewritten so resolved x equals the input (end-anchored nodes keep their anchor)                       | —                                                                                               |
| OP-INSPECT-2 | type X on an **in-flow** child                             | **FORK** — `anchor`: typed error surfaced as a disabled field + "detach" affordance; `sheet`: editor-level equivalent (field disabled by discipline). Never a silent no-op | —                                                                                               |
| OP-INSPECT-3 | type W/H                                                   | size intent; on auto/fill nodes: mode → fixed with memory (as OP-SIZE-7)                                                                                                   | flow ripple as OP-SIZE-6                                                                        |
| OP-INSPECT-4 | **switch anchor/constraint mode** (left↔right↔center↔span) | axis binding variant + a _captured_ offset computed from resolved geometry so **the node does not move** (doctrine 3)                                                      | changes future behavior (parent resize), not present geometry — test: G-2 after a parent resize |
| OP-INSPECT-5 | type rotation                                              | θ, own-center pivot (OP-ROT-6)                                                                                                                                             | —                                                                                               |
| OP-INSPECT-6 | mixed multi-selection numeric edit                         | same field on every node (absolute set, not delta — POL, declared)                                                                                                         | —                                                                                               |
| OP-INSPECT-7 | clear/reset a field (e.g. remove max-width)                | field → structurally unset (H11 — never a sentinel write)                                                                                                                  | —                                                                                               |

## 8. Content edits with geometric consequence (`OP-CONTENT-*`)

| id           | how                              | writes                                                             | effect / ripple                                                                                                                          |
| ------------ | -------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| OP-CONTENT-1 | typing in auto-width text        | **text content only — zero geometry writes**                       | measured box grows → bindings re-resolve → flex siblings move → hug ancestors re-fit: the full one-way pipeline exercised by a keystroke |
| OP-CONTENT-2 | vector vertex edit               | payload (network) only                                             | measured box changes; same ripple chain                                                                                                  |
| OP-CONTENT-3 | corner-radius handle drag        | payload style field                                                | paint only — never geometry/layout (X-SELF-7 separation)                                                                                 |
| OP-CONTENT-4 | flip horizontal/vertical buttons | per R-E5 declared representation (payload mirror or flip encoding) | POL                                                                                                                                      |

## 9. Clipboard & duplication (`OP-CLIP-*`)

| id        | how                                      | writes                                                                                                                                                     | effect / ripple                                         |
| --------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| OP-CLIP-1 | copy/paste in same parent                | new nodes, fresh ids, order appended; position offset per declared rule (+10,+10 or in-place — POL)                                                        | —                                                       |
| OP-CLIP-2 | paste into a different parent / document | geometry re-expressed in the destination space; world-position-preserve vs viewport-center per declared rule (POL); unknown/foreign fields preserved (M-4) | —                                                       |
| OP-CLIP-3 | alt-drag duplicate                       | clone + OP-MOVE-1 on the clone, one undo step                                                                                                              | in flex: clone inserts at index (OP-CREATE-3 semantics) |

## 10. History (`OP-HIST-*`)

| id        | how                             | guarantee                                                                                                                    |
| --------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| OP-HIST-1 | undo                            | restores the exact prior document (byte/canonical equality — MM-7 class); resolved geometry follows deterministically (MM-3) |
| OP-HIST-2 | redo                            | inverse of OP-HIST-1                                                                                                         |
| OP-HIST-3 | undo across a collaborative gap | undoes _own_ ops only (op-granular, field-set scoped); merged-in remote writes survive — the C-matrix governs conflicts      |

---

## What this catalog exposed (doctrine found by enumeration)

1. **Write-count as a design signal.** Center pivot makes the gesture costs
   legible: rotate = 1 field, alt-resize = 2, corner-resize = 4, group
   rotate = 3, container resize = parent-only. Any model change that
   inflates these counts is regressing the editor.
2. **The three sanctioned bake moments** (doctrine 3) are the complete list
   of state→intent flow. If a fourth ever appears in code review, it is
   either this list growing (spec change) or a bug.
3. **`order` is one field with two meanings** (paint order & flow order) —
   cheap and mostly right, but it forbids "visually behind yet first in
   flow"; declared as a known limit (OP-TREE-5).
4. **The FORK rows are few and vivid here too**: OP-ROT-2 is the finale's
   deciding question as a literal drag — rotating a card in a list either
   makes room or overlaps. Whoever decides the finale should perform that
   gesture in their head first.
