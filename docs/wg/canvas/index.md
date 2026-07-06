---
title: Canvas
description: The universal specification of the Grida canvas editor — its concepts, contracts, and the verification doctrine that any conforming implementation (web, native, headless) satisfies.
tags:
  - internal
  - wg
  - canvas
format: md
---

This cluster is the **universal specification of the Grida canvas
editor** — the interaction surface, selection, tools, precision aids,
input, io, and the panels' behavioral contracts — written at spec
altitude and implementation-agnostic. Any host — a web reducer, a
native event loop, a headless agent — is _the same editor_ if it
conforms to these documents; it is not defined by mirroring another
implementation's code.

This is the **one home** for these universal concepts. It points
_outward_ to the deep feature studies that each warrant their own
pedantic treatment (history, realtime sync, vector networks, booleans,
text editing), and _inward_ to the reference implementation that binds
these contracts to running code.

## Doctrine

1. **Spec-first.** A conforming implementation follows these documents;
   the documents never silently follow an implementation. When reality
   wins an argument, the spec is amended explicitly, in the same change.
2. **Headless-testable.** Every behavioral claim must be assertable
   without a window or a human: drive the editor with commands and
   synthetic surface events; assert document/editor state (or pixels,
   via the rendering test infrastructure). A claim that cannot be
   tested headlessly is rewritten until it can.
3. **Verifiable contracts.** Each document ends with numbered contract
   clauses (`TGT-1`, `SNAP-3`, `IO-2`, …). Conformance tests cite
   contract ids; the contract sections are the normative core, and
   prose exists to justify them.
4. **One home, no per-editor duplication.** A universal concept lives
   here once. Two editors re-specifying selection or targeting under
   their own names is the smell this cluster exists to remove.

## Concept map

**Core**

| Concept   | One line                                                                                                                                                 | Spec                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **state** | The state domains (content, authoring context, view, interaction, collaboration) and the mutation vocabulary that is the only way to change the document | [state.md](./state.md) |

**Interaction**

| Concept                 | One line                                                                                                                  | Spec                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **surface**             | Pointer interaction on the canvas: hit-testing tiers, gestures, intents, chrome                                           | [surface.md](./surface.md)                                               |
| **selection & intent**  | What selection _feels_ like, and how pointer-down routes to intent (immediate vs deferred)                                | [ux-surface/](./ux-surface/)                                             |
| **targeting**           | Pointer→node resolution mathematics: hit chains, graph-distance, descent, deep-select, marquee predicates                 | [ux-surface/targeting.md](./ux-surface/targeting.md)                     |
| **selection partition** | The per-parent partition of a multi-node selection: N overlay boxes, and which commands act per-partition vs on the union | [ux-surface/selection-partition.md](./ux-surface/selection-partition.md) |
| **edit mode**           | The exclusive nested-editing slot and its taxonomy: content modes (text, vector) vs paint sessions                        | [edit-mode.md](./edit-mode.md)                                           |
| **paint session**       | The in-canvas editing surfaces for one paint — the gradient control frame + stop track, the image quad — and the normalized transform model each edits | [paint-session/](./paint-session/)                                       |
| **tool**                | The authoring tool system: taxonomy, activation, insertion gestures, container adoption                                   | [tool.md](./tool.md)                                                     |
| **translate**           | The move gesture's structural models: clone-on-translate and live re-parenting                                            | [translate.md](./translate.md)                                           |

**Structure**

Commands that restructure the node tree. Each is a
[per-partition](./ux-surface/selection-partition.md) command — it acts
once per selection partition, inserting one adopting parent per group.

| Concept             | One line                                                                            | Spec                                                                                |
| ------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **grouping**        | Wrap a selection into a group or a container, per partition; ungroup as the inverse | [grouping.md](./grouping.md)                                                        |
| **auto-layout**     | Wrap-and-infer: convert a selection into a laid-out flex container, per partition   | [auto-layout.md](./auto-layout.md)                                                  |
| **flatten**         | Combine a selection's shapes into one baked vector, per partition (destructive)     | [feat-vector-network/flatten.md](../feat-vector-network/flatten.md)                 |
| **create outlines** | Convert text to its glyph-outline vector paths, per node in place (font-baking)     | [feat-vector-network/create-outlines.md](../feat-vector-network/create-outlines.md) |
| **boolean**         | Non-destructive path algebra: wrap a partition into one boolean-operation node      | [feat-vector-network/boolean.md](../feat-vector-network/boolean.md)                 |

**Precision & chrome**

| Concept               | One line                                                                                  | Spec                                           |
| --------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **snap**              | Gesture-time alignment: geometry, space, and pixel-grid snapping as interpretation stages | [snap.md](./snap.md)                           |
| **measurement**       | The modifier-held spacing readout between the selection and the hovered node              | [measurement.md](./measurement.md)             |
| **ruler**             | The edge rulers and the persistent per-scene guides they author                           | [ruler.md](./ruler.md)                         |
| **pixel grid**        | The unit lattice's visual render, split from snapping to it                               | [pixel-grid.md](./pixel-grid.md)               |
| **transparency grid** | The alpha backdrop at the bottom of the canvas stack                                      | [transparency-grid.md](./transparency-grid.md) |
| **align**             | Align & distribute: the reference-frame rule and equal-gap distribution                   | [align.md](./align.md)                         |
| **nudge**             | The arrow-key family: translate/resize nudge, in-flow reorder, empty-selection pan        | [nudge.md](./nudge.md)                         |

**Input**

| Concept       | One line                                                                       | Spec                           |
| ------------- | ------------------------------------------------------------------------------ | ------------------------------ |
| **input**     | The input pipeline, command vocabulary, keybinding model, and routing priority | [input.md](./input.md)         |
| **traversal** | Keyboard selection traversal: down/up the tree, across siblings, camera reveal | [traversal.md](./traversal.md) |

**IO**

| Concept           | One line                                                                                  | Spec                               |
| ----------------- | ----------------------------------------------------------------------------------------- | ---------------------------------- |
| **io**            | Import, export, and clipboard: files in, files out, fragments across instances            | [io.md](./io.md)                   |
| **io — external** | Foreign content intake and outward flavors: drop matrix, paste sniffing, placement, trust | [io-external.md](./io-external.md) |

**Panels**

| Concept       | One line                                                                            | Spec                           |
| ------------- | ----------------------------------------------------------------------------------- | ------------------------------ |
| **hierarchy** | The layers tree: presentation order, selection sync, drag semantics, virtualization | [hierarchy.md](./hierarchy.md) |

## Deep studies (specified elsewhere, referenced here)

These concepts are technical enough to warrant their own dedicated,
pedantic study. The canvas spec relies on them but does not restate
them; the study is the source of truth, and this home points to it.

- **history** — undo/redo as data, gesture framing, origin taxonomy:
  [feat-history](../feat-history/).
- **realtime sync (CRDT)** — optimistic replication, authority order,
  presence: [feat-crdt](../feat-crdt/).
- **vector networks & the pen** — network topology, projection,
  tangent mirroring, bending: [feat-vector-network](../feat-vector-network/).
- **boolean path operations** — non-destructive path algebra:
  [feat-vector-network](../feat-vector-network/boolean.md).
- **flatten** — the destructive combine into one baked vector, the
  counterpart to boolean: [feat-vector-network](../feat-vector-network/flatten.md).
- **create outlines** — text → its glyph-outline vector paths, per node
  in place: [feat-vector-network](../feat-vector-network/create-outlines.md).
- **text editing** — the engine-level text model and geometry surface:
  [feat-text-editing](../feat-text-editing/).

## The reference implementation

The native reference editor
([`crates/grida_editor`](https://github.com/gridaco/grida/tree/main/crates/grida_editor)) implements
this specification and carries its own **implementation-binding**
specs — frame reconciliation, the application shell, the dev-only
widget/UI layer, the inspector and layers panels, and the conformance
harness — in [its own docs](https://github.com/gridaco/grida/tree/main/crates/grida_editor/docs), kept
next to the code they bind. This spec stays code-agnostic; the crate
owns the mapping from these contracts to running Rust.
