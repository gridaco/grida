---
title: "Figma REST API strokeGeometry Alignment Behavior"
format: md
unlisted: true
---

# Figma REST API `strokeGeometry` Alignment Behavior

## Summary

The Figma REST API `geometry=paths` response returns `fillGeometry` and `strokeGeometry` as **independent, alignment-unaware geometry**. The `strokeAlign` property is not baked into either — it is purely a **paint order and clipping instruction** that the consumer must apply.

This is not a bug. It is consistent once you treat fill and stroke as two independent shapes that are composited together with a specific ordering and clipping rule.

## The Mental Model

A node's visual output is composed from two independent shapes:

1. **Fill shape** (`fillGeometry`) — the filled area of the node
2. **Stroke shape** (`strokeGeometry`) — the expanded stroke outline (always a CENTER expansion of width `sw`)

These two shapes never change based on `strokeAlign`. The alignment property controls **how they are composited**:

| `strokeAlign` | What it actually means                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `CENTER`      | Draw fill, then draw stroke on top. The stroke band extends `sw/2` each way from the fill edge — its natural shape.             |
| `OUTSIDE`     | Draw stroke first, then draw fill on top. The fill covers the inward half of the stroke, leaving only the outward half visible. |
| `INSIDE`      | Draw fill, then draw stroke clipped to the fill shape. The clip removes the outward half, leaving only the inward half visible. |

The geometry itself is always the same CENTER expansion. `strokeAlign` is a compositing instruction, not a geometry modifier.

## Why This Looks Wrong at First

If you naively render `strokeGeometry` on top of `fillGeometry` (the default paint order), only CENTER produces the correct result. INSIDE and OUTSIDE appear broken:

- **OUTSIDE** looks too thick — because the inward half of the stroke is visible when it should be hidden behind the fill
- **INSIDE** extends beyond the fill bounds — because the outward half is visible when it should be clipped

But the geometry isn't wrong. The compositing is.

## Empirical Verification

Tested with a 20×20 rectangle, strokeWeight = 10, fill bounds = `[0, 0]` to `[20, 20]`.
Source: `fixtures/test-figma/rest-api/L0/stroke.json` (from `fixtures/test-fig/L0/stroke.fig`).

### `strokeGeometry` bounds (all alignments)

| `strokeAlign` | `fillGeometry` bounds  | `strokeGeometry` bounds    | Stroke band width |
| ------------- | ---------------------- | -------------------------- | ----------------- |
| CENTER        | `[0, 0]` to `[20, 20]` | `[-5, -5]` to `[25, 25]`   | 10 = sw           |
| OUTSIDE       | `[0, 0]` to `[20, 20]` | `[-10, -10]` to `[30, 30]` | 20 = 2×sw         |
| INSIDE        | `[0, 0]` to `[20, 20]` | `[-10, -10]` to `[30, 30]` | 20 = 2×sw         |

### Key observations

1. **`fillGeometry` is identical across all three alignments.** The fill shape does not change — it's always `[0, 0]` to `[20, 20]`.

2. **INSIDE and OUTSIDE `strokeGeometry` are byte-for-byte identical.** Both produce the same expanded stroke path. This confirms that `strokeAlign` does not modify the geometry.

3. **CENTER `strokeGeometry` is different** — it has a narrower band (sw wide vs 2×sw). This appears to be the only case where the API computes a tighter stroke expansion, but the result is equivalent: a CENTER stroke rendered as-is looks correct because the band is naturally centered.

4. The CENTER stroke band (`[-5, 25]`, width = sw) and the OUTSIDE/INSIDE band (`[-10, 30]`, width = 2×sw) differ in expansion factor. CENTER uses `sw/2` per side; OUTSIDE/INSIDE use `sw` per side. Both are "the stroke shape" — just computed with different expansion widths.

## Rendering Strategy

| `strokeAlign` | Paint order                   | Clipping                      | Effect                                           |
| ------------- | ----------------------------- | ----------------------------- | ------------------------------------------------ |
| `CENTER`      | fill first, stroke on top     | none                          | Stroke overlaps fill edges equally on both sides |
| `OUTSIDE`     | **stroke first, fill on top** | none                          | Fill covers the inward half of the stroke        |
| `INSIDE`      | fill first, stroke on top     | **clip stroke to fill shape** | Clip removes the outward half of the stroke      |

### `OUTSIDE` — paint order swap

```
1. Draw strokeGeometry (extends sw beyond fill on each side)
2. Draw fillGeometry on top (covers the inward sw portion)
Result: only the outward sw band remains visible
```

No clipping needed — just reorder.

### `INSIDE` — clip to fill

```
1. Draw fillGeometry
2. Set clip path = fillGeometry
3. Draw strokeGeometry within clip
Result: only the inward portion within the fill shape is visible
```

Requires clip path support.

### `CENTER` — as-is

```
1. Draw fillGeometry
2. Draw strokeGeometry on top
Result: correct as-is (band is sw/2 each way, naturally centered)
```

## Current Implementation Status

| `strokeAlign` | Status          | Notes                                                   |
| ------------- | --------------- | ------------------------------------------------------- |
| `CENTER`      | **Implemented** | Render as-is                                            |
| `OUTSIDE`     | **Implemented** | Paint order swap (stroke first, fill on top)            |
| `INSIDE`      | **Implemented** | Boolean intersection (fill ∩ stroke) via BooleanOp node |

## Test Fixtures

| File                                          | Format              | Description                                                    |
| --------------------------------------------- | ------------------- | -------------------------------------------------------------- |
| `fixtures/test-fig/L0/stroke.fig`             | Figma binary (.fig) | Source Figma file with INSIDE, CENTER, OUTSIDE stroke variants |
| `fixtures/test-figma/rest-api/L0/stroke.json` | REST API JSON       | `geometry=paths` response (sw=10, all 3 alignments, 6 nodes)   |

## References

- Figma REST API: `geometry=paths` parameter on `GET /v1/files/:key`
- Figma OpenAPI spec: `strokeGeometry` described as "An array of paths representing the object stroke" — no mention of alignment being applied to the geometry

## Tracking

If a future Figma API update changes the `strokeGeometry` behavior (e.g. baking alignment into the geometry), the rendering strategy here would need revisiting. Grep for `strokeAlign` in `packages/grida-canvas-io-figma/lib.ts` to find implementation code.
