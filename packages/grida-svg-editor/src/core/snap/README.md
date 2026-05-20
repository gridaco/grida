# `core/snap/` — snap engine

Snap-to-neighbor logic for translate gestures. Built on top of
[`@grida/cmath/_snap`](../../../../grida-cmath/_snap.ts), which provides
the 9-point edge / center / spacing / point math.

## Layout

| File              | Role                                                                 | Editor-agnostic?                              |
| ----------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| `options.ts`      | `SnapOptions`, `DEFAULT_SNAP_OPTIONS`                                | ✅ yes — pure types + constants               |
| `session.ts`      | `SnapSession` class (gesture-scoped state + per-frame `snap()` call) | ✅ yes — takes raw `Rect[]`, calls cmath only |
| `neighborhood.ts` | `compute_neighborhood(doc, ids)`                                     | ❌ no — depends on `SvgDocument`              |
| `index.ts`        | barrel                                                               | —                                             |

## Extractability boundary

`session.ts` and `options.ts` are the seeds of a future shared snap
package (`@grida/snap`, if it ever lands). Today there is exactly one
consumer (svg-editor), so the package is premature — but the directory
is laid out so the extraction is `mv`, not a refactor.

**The agnostic files MUST NOT import**:

- `../document` (any document IR)
- `../../dom` / `../../text-surface` (any DOM type)
- `editor.geometry` / `editor.state` / any editor-singleton

If you find yourself reaching for one of these inside `session.ts`,
the data should be passed in at construction instead.

`neighborhood.ts` is editor-specific and stays per-editor: the choice
of "what counts as a snap target" depends on the document's tree shape.

## Coordinate space

The session is space-agnostic, but agents, neighbors, candidate delta,
and threshold must all share the same space. svg-editor uses
**world space** — the root SVG's own user-coordinate system — so
pipeline math stays exact across camera zooms (a CSS-pixel pipeline
would carry float-noise through `getScreenCTM`'s irrational entries at
any non-integer zoom). The DOM adapter is responsible for two
boundary conversions: (1) cursor delta CSS-px → world via
`/= camera.zoom` at the intent boundary, and (2) snap-guide world →
CSS-px via `camera.world_to_screen` at HUD paint time. The threshold
the editor passes through as `snap_threshold_px` is the user-visible
CSS-px intent divided by `camera.zoom` so a 10-px threshold stays 10
on-screen pixels at any zoom.

## Performance notes

- Neighbor rects are quantized **once** in the constructor; `snap()`
  reuses them across frames.
- `snap()` runs an AABB pre-filter unconditionally — the comparison
  loop is cheaper than cmath's per-anchor 9-point generation even at
  small N.
- cmath's spacing snap silently degrades past 64 anchors; edge /
  center / point snap continue to work.
- `dispose()` releases frozen refs; subsequent `snap()` calls return
  identity (input delta, no guide).
