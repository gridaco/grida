---
title: Tool
description: The authoring tool system — tool taxonomy, activation, per-tool insertion gestures, container adoption, and the text/pencil authoring flows.
tags:
  - internal
  - wg
  - editor
format: md
---

The **tool** is the editor's answer to "what does the next canvas
pointer sequence mean?" With the cursor tool it means select/translate
(the [surface](./surface.md) gestures); with an authoring tool it means
_create content_. This document specifies the tool taxonomy, how tools
are activated, and the per-tool interaction contracts — grounded in the
production web editor's tool system, which is the semantic source of
truth for what each tool feels like.

## Position in the system

- The active tool is **instance UI state** (per the golden [state
  model](./state.md)): not part of the document, not
  undoable, not persisted, not replicated (at most surfaced as
  presence).
- The tool machine is **editor-core**, headless: it consumes normalized
  pointer events in canvas space and emits mutation batches through the
  editor's dispatch — never touching a renderer. The shell only routes
  events to it and reflects its outcome (cursor icon, toolbar
  highlight).
- Authoring previews ride the existing gesture frame
  ([history](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/history.md) `HISB-2`): a drag-insert is `begin_gesture`
  → insert + size previews (silent) → `commit_gesture`. Escape aborts
  the frame; the inserted node vanishes because gesture abort is
  already specified to restore the pre-gesture document (`HISB-4`).
  The tool system introduces **no new preview mechanism**.

## Taxonomy

Tools form a closed set. "Tool" is reserved for modes that change what
content-directed pointer input _does_; affordances that merely change
navigation (hand, zoom) are **virtual tools** — cursor modes to the
human, not tools in the taxonomy.

| Tool      | Key       | Class       | Produces                                                                      |
| --------- | --------- | ----------- | ----------------------------------------------------------------------------- |
| cursor    | `V`       | pointer     | selection / surface gestures (the default)                                    |
| rectangle | `R`       | insert      | Rectangle node                                                                |
| ellipse   | `O`       | insert      | Ellipse node                                                                  |
| polygon   | `Y`       | insert      | RegularPolygon node                                                           |
| container | `A`, `F`  | insert      | Container node (+ adoption)                                                   |
| tray      | `Shift+F` | insert      | Tray node (+ adoption)                                                        |
| text      | `T`       | insert      | TextSpan node + edit session                                                  |
| line      | `L`       | draw        | Line node                                                                     |
| arrow     | `Shift+L` | draw        | Line node with an end marker                                                  |
| pencil    | `Shift+P` | draw        | Vector node (polyline network)                                                |
| pen       | `P`       | mode-scoped | vector network editing ([vector-edit](../feat-vector-network/vector-edit.md)) |
| scale     | `K`       | deferred    | parametric resize of the selection                                            |

Web-parity notes, decided here as spec:

- **Arrow is not a node kind.** Web models arrow as the same vector
  polyline as line plus a `marker_end_shape`; the engine's Line node
  carries `marker_start_shape`/`marker_end_shape` natively. Arrow =
  line tool that sets the end marker. One node kind, one property
  difference (TOOL-9).
- **Virtual tools** (hand `H`, zoom `Z`) and the selection-adjacent
  tools (lasso `Q`) are out of the authoring taxonomy; hand/zoom are
  navigation bindings the shell already owns.
- **Deferred tools** are named, with study notes below, and reserved
  keys — pressing a deferred tool's key is a no-op, never a
  misbinding.

## Activation & lifecycle

- Activation: toolbar click or shortcut key. Keys route to tools only
  when no widget has keyboard focus and no text-edit session is active
  (the [ui](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/ui.md) `UI-3` focus ladder and the text session win
  first).
- The cursor tool is the home state. After an insert tool completes
  one insertion (click or drag), the tool **reverts to cursor** —
  except **pencil, which stays active** so consecutive strokes need no
  re-arming (web parity; TOOL-8).
- Escape steps down one rung at a time: abort an in-flight authoring
  drag → revert a non-cursor tool to cursor → (then the surface's own
  Escape semantics: deselect).
- While a non-cursor tool is armed, canvas pointer events go to the
  tool machine — the surface's select/translate gestures do not run
  (the arbitration ladder of `SURF-1` gains one rung: panel → chrome →
  **tool** → content).

## Insertion gestures (shapes, container, tray, text)

One state machine serves every insert tool:

```
idle --pointer-down--> armed(anchor)
armed --pointer-up (< threshold)--> CLICK INSERT, done
armed --pointer-move (≥ threshold)--> dragging: insert 1×1 at anchor (gesture opens)
dragging --pointer-move--> size preview = rect(anchor, current)
dragging --pointer-up--> commit (adoption for container/tray), done
dragging --Escape--> abort gesture (document as before), tool stays armed
```

- **Click insert**: a default-size node (100×100, web parity)
  **centered** on the point. **Drag insert**: the node is created at
  the anchor once the pointer travels the threshold, then its
  position/size track the rect spanned by anchor and pointer
  (normalized so dragging up-left works). The threshold is an explicit
  constant in screen px — the web editor inherits its host's implicit
  drag threshold (~5 px); this spec makes it a named number rather
  than an accident.
- Either path yields **exactly one history entry** whose undo removes
  the node (TOOL-3); the entry is endpoint-shaped, not a replay of
  every size preview (gesture framing's endpoint minimality — see
  [history](https://github.com/gridaco/grida/blob/main/crates/grida_editor/docs/history.md), HISB-2).
- The insert targets the **scene root level** at the top of the
  z-order. Inserting into a hovered container is a later refinement
  and must not change the entry shape when it lands.

## Container & tray adoption

Drag-inserting a container (or tray) over existing content **adopts**
it — this is what makes the container tool a hierarchy-authoring tool
and not just a rect with children:

- Candidates are the container's would-be **siblings** (children of
  the parent the container is inserted into). The predicate is
  **full containment**: a sibling whose world bounds lie entirely
  inside the drawn rect is adopted; intersection is not enough (web
  parity: `cmath.rect.contains`).
- Adopted nodes become children of the new container, **preserving
  document order** among themselves, and their positions are
  re-anchored to the container's space so their **world position does
  not move** (TOOL-5).
- Adoption is part of the same gesture — the insert, the moves, and
  the re-anchoring patches are one history entry; undo restores the
  original parent, order, and positions in one step.
- Click-inserting a container adopts nothing (there is no drawn
  region).
- M1 restriction, stated honestly: candidates whose bounds the editor
  cannot compute without a renderer (auto-sized kinds) are skipped;
  the contract tests pin the concrete-size kinds.

## Text

The text tool composes insertion with the engine's text-edit session
(the dedicated text editor — see the golden
[text editing](../feat-text-editing/) docs):

- Click: insert an auto-sized TextSpan at the point and enter the
  edit session. Drag: insert with the dragged width, then enter the
  edit session on release.
- The session is a **scoped sub-editor**: while it is active, keys go
  to it (its own caret, selection, and internal undo); the document
  is not patched per keystroke. On exit-commit, the final text becomes
  one `Patch` — insert + typed text are **one history entry**
  (TOOL-6).
- Exiting a _fresh_ text node with no content aborts the whole frame:
  no node, no entry (TOOL-7's click-inserts-nothing spirit — empty
  authoring leaves no trace).
- Entering edit mode on an existing text node (double-click with the
  cursor tool) uses the same session and the same one-entry commit
  contract, with the entry containing only the text patch.

## Pencil

- Drag-only: pointer-down arms, movement past the threshold begins a
  stroke, pointer-up commits it. A click inserts nothing (TOOL-7).
- A stroke is a **Vector node** whose network is the sampled polyline
  (one vertex per pointer move, straight segments — no smoothing or
  simplification in M1; the network representation leaves room for
  both later).
- The stroke previews live (the growing polyline is a silent patch per
  sample inside the gesture frame) and commits as one endpoint-shaped
  entry: undo removes the stroke.
- Pencil stays active after a stroke (TOOL-8 exception).

## Deferred tools — study notes

Recorded so deferral is a decision, not a gap:

- **Pen (`P`)** — _graduated_: specified in
  [vector-edit.md](../feat-vector-network/vector-edit.md) (the mode, the pen state
  machine, bending, tangent mirroring, escape semantics) and
  implemented in the reference editor. It is **mode-scoped**, not a
  taxonomy member here: the pen lives in the vector content mode's
  legal tool set ([edit-mode](./edit-mode.md)), and `P` outside the
  mode is the mode's _entry_ (edit the selected vector, or create
  from scratch on the first placement) — never an armed document
  tool.
- **Scale (`K`)** — selection-parametric resize: drags scale the
  selection proportionally (position and size together), tool stays
  active. It is a _modifier of surface gestures_ rather than an
  authoring tool; defer until the surface's resize gesture is bound
  through the editor.

## Contracts

- **TOOL-1** The tool set is closed and the cursor tool is the
  default: a fresh editor instance is in cursor mode, and activating
  any tool is observable via the instance's tool query without any
  document effect.
- **TOOL-2** Tool state is instance UI state: activating or using a
  tool is never recorded in history, never alters the document by
  itself, and does not travel over sync.
- **TOOL-3** Insert tools produce exactly one history entry per
  insertion, for both click-insert (default size, centered on the
  point) and drag-insert (anchor-to-pointer rect); a single undo
  removes the inserted node entirely.
- **TOOL-4** Escape during an authoring drag aborts it: the document
  is mutation-for-mutation identical to the pre-gesture state and no
  history entry exists.
- **TOOL-5** Completing a container/tray drag-insert adopts exactly
  the siblings whose bounds are fully contained in the drawn rect:
  they become children in their prior relative order, their world
  positions are unchanged, and the insert + adoption is one history
  entry (one undo restores everything).
- **TOOL-6** Text-tool authoring (insert, then the edit session, then
  exit-commit) yields one history entry containing the node with its
  final text; exiting a fresh text node with no content yields no node
  and no entry.
- **TOOL-7** Draw tools are drag-only: a click (below the drag
  threshold) with line, arrow, or pencil inserts nothing and records
  nothing.
- **TOOL-8** After a completed insertion the active tool reverts to
  cursor — except pencil, which remains active across strokes.
- **TOOL-9** The arrow tool's output differs from the line tool's
  output only in marker properties: same node kind, same geometry
  contract.
