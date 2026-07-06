---
title: Snap — vector geometry
description: Placeholder — snapping vector anchors and segments while vector-editing. Deferred with the vector-edit feature.
tags:
  - internal
  - wg
  - editor
format: md
---

**Placeholder.** This page reserves the vector member of the
[snap](../canvas/snap.md) family; its details and implementation are deferred
with the [vector-edit](./vector-edit.md) implementation. The mode
itself — and the summary of what its snapping must cover — is now
specified in [vector-edit.md](./vector-edit.md); this page will hold
the source/threshold/chrome details when they are authored.

Vector snapping is a distinct system, not a variant of the rect
snaps: the agents are **points** (dragged anchors, curve control
points, pen-tool candidates), and the targets are the shape's own
geometry — other anchors, segment midpoints/intersections, the
shape's frame — plus the usual neighborhood. That changes every layer
the rect family settled: the session freezes point sets instead of
nine-point rects, thresholds capture point-to-point, and the chrome
marks points and connecting hairlines rather than edge rules or gap
labels. The pipeline placement does not change: it is interpretation
(SNAP-1 applies unchanged), gated by the same geometry toggle and
disable modifier.

Doctrine sources, when this gets specified: the web's vector content
edit mode (`event-target.cem-vector.reducer.ts`, the `path` tool +
`curve`/`translate-vector-controls` gestures) and `@grida/svg-editor`'s
`core/vector-edit/`; the engine seam is `cmath`'s point-anchor
snapping (`snapToPoints` / `by_points` in `@grida/cmath/_snap`),
which `math2::snap` does not yet port — that port is the named engine
gap in [snap.md](../canvas/snap.md)'s Engine notes.

Contracts will be authored with the feature (reserved prefix:
`VSNAP-*`); until then the deferral is tracked in snap.md's deferred
list.
