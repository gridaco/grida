---
title: Paint Session
tags:
  - internal
  - wg
  - canvas
format: md
---

A **paint session** is the editing context for one _paint_ — a single
entry of a node's fill or stroke paint list — while its editor is open.
The [edit-mode slot](../edit-mode.md) owns the session as a category
(entry, exit, exclusivity, subject pinning, the domain it lives in); this
cluster owns what that slot delegates and does not restate: **the
canvas-side editing surface of each paint kind, and the coordinate model
that surface reads and writes.**

Two paint kinds carry an in-canvas surface:

- [**Gradient**](./gradient.md) — the control-point frame and the
  color-stop track, over a normalized gradient space that differs per
  gradient type.
- [**Image**](./image.md) — the quad transform handles, over the image
  paint's placement model.

Solid paint has no session (a color has no geometry to edit on the
canvas); its only editor is the panel color control.

## What this cluster owns, and what it defers

The [edit-mode](../edit-mode.md) spec is the golden owner of the session
_as a slot_. This cluster **defers to it** for every lifecycle fact and
specifies only the surface delta:

| Concern                                                        | Owned by                              |
| -------------------------------------------------------------- | ------------------------------------- |
| Exclusivity, entry idiom, exit ladder, subject pinning, domain | [edit-mode](../edit-mode.md) `MODE-*` |
| The normalized value model each surface edits                  | this cluster (`PSES-2`, per-kind)     |
| The canvas chrome, its handles, and their gestures             | per-kind (`GRAD-*`, `IMG-*`)          |

A paint session never appears in a saved document, round-trips through
undo as authoring context, and ends without residue when its subject or
its paint is removed — all of that is [edit-mode](../edit-mode.md)'s to
state, not this cluster's.

## The normalized value model

The load-bearing idea shared by both surfaces, and the reason a paint
session is worth specifying apart from a property panel:

> **A paint defines its value in a normalized space intrinsic to the
> paint kind, and the node's geometry maps that space to the object.**
> The session edits the _normalized_ value; it never edits object-space
> pixels directly.

This is what makes a paint resolution-independent: resizing the node
re-maps the same normalized definition, and the session's handles are
placed by mapping the normalized value _out_ to the canvas, while a drag
is applied by mapping the pointer _back_ into normalized space. Each
paint kind fixes its own normalized space and its own mapping — the
[gradient](./gradient.md) types each define a unit gradient space, the
[image](./image.md) defines a unit paint box — and those definitions are
the canonical model this cluster exists to pin down.

## Shared surface doctrine

- **PSES-1 — Two views, one state.** A paint session's panel control and
  its canvas chrome are two renderings of one authoring state. An edit
  made through either is the same edit; neither holds an independent copy
  that the other must be synced to. Opening the panel control and the
  canvas surface does not fork the value.

- **PSES-2 — Normalized value.** The editable value of a paint is
  expressed in a space intrinsic to the paint kind, mapped to the node by
  the node's own geometry (never baked into object-space coordinates).
  The session's handles are the normalized value mapped out to the
  canvas; a gesture is the pointer mapped back in. Resizing or
  transforming the node changes the mapping, not the stored value.

- **PSES-3 — Preview, then commit.** A continuous gesture (dragging a
  handle or a stop) previews live and silently, and commits **once** on
  release as a single reversible step. A discrete edit (inserting or
  removing a stop, a keyboard step) commits immediately as its own step.
  No intermediate frame of a drag is independently reversible.

- **PSES-4 — Subject address.** A session is pinned to a paint address —
  `(node, fill | stroke, paint index)` — fixed at entry. The surface
  reads and writes exactly that paint. If the address stops resolving to
  a paint of the session's kind (the paint is retyped or removed), the
  session ends — the [edit-mode](../edit-mode.md) `MODE-5` dispatch.
