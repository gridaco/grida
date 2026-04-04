---
format: md
---

# L0/stroke — Stroke Alignment Geometry Fixture

REST API response (`geometry=paths`) for `fixtures/test-fig/L0/stroke.fig`.

## What this fixture contains

6 VECTOR nodes — a 20×20 rectangle with `strokeWeight=10` in every combination of:

| #   | Name                                         | `strokeAlign` | Has fill | Has stroke |
| --- | -------------------------------------------- | ------------- | -------- | ---------- |
| 0   | `outside-rect-vector-with-fills-and-strokes` | OUTSIDE       | yes      | yes        |
| 1   | `outside-rect-vector-with-strokes`           | OUTSIDE       | yes      | yes        |
| 2   | `center-rect-vector-with-fills-and-strokes`  | CENTER        | yes      | yes        |
| 3   | `center-rect-vector-with-strokes`            | CENTER        | yes      | yes        |
| 4   | `inside-rect-vector-with-fills-and-strokes`  | INSIDE        | yes      | yes        |
| 5   | `inside-rect-vector-with-strokes`            | INSIDE        | yes      | yes        |

All nodes share the same base rectangle: `fillGeometry` bounds `[0, 0]` to `[20, 20]`.

## What to focus on

### `strokeAlign` is a compositing instruction, not a geometry modifier

Both `fillGeometry` and `strokeGeometry` are returned as **independent shapes**. The `fillGeometry` is always the unmodified fill shape. The `strokeGeometry` expansion factor differs by alignment (CENTER = `sw` band, INSIDE/OUTSIDE = `2×sw` band), but the same geometry is returned for both INSIDE and OUTSIDE — `strokeAlign` does not modify the geometry beyond this.

The `strokeAlign` property tells the consumer how to **composite** the two shapes (paint order + clipping), not how to modify them.

### Measured geometry bounds

| `strokeAlign` | `fillGeometry` bounds  | `strokeGeometry` bounds    | Notes       |
| ------------- | ---------------------- | -------------------------- | ----------- |
| OUTSIDE       | `[0, 0]` to `[20, 20]` | `[-10, -10]` to `[30, 30]` | band = 2×sw |
| CENTER        | `[0, 0]` to `[20, 20]` | `[-5, -5]` to `[25, 25]`   | band = sw   |
| INSIDE        | `[0, 0]` to `[20, 20]` | `[-10, -10]` to `[30, 30]` | band = 2×sw |

INSIDE and OUTSIDE produce **byte-for-byte identical** `strokeGeometry` paths. CENTER has a narrower expansion (sw/2 per side instead of sw per side).

### Correct compositing per alignment

| `strokeAlign` | Paint order                        | Clipping                | Result                             |
| ------------- | ---------------------------------- | ----------------------- | ---------------------------------- |
| CENTER        | fill, then stroke                  | none                    | Stroke overlaps fill edges equally |
| OUTSIDE       | **stroke first, then fill on top** | none                    | Fill covers the inward half        |
| INSIDE        | fill, then stroke                  | **clip stroke to fill** | Clip removes the outward half      |

See `docs/wg/feat-fig/stroke-geometry-alignment.md` for full analysis and implementation strategy.
