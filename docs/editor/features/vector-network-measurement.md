# Vector Measurement Feature

## Overview

The vector measurement feature extends the existing measurement system to work with vector networks. It provides the same axis-aligned distance measurements (X/Y independently) but adds support for:

- **Vector2 points** (treated as zero-size rectangles)
- **Curve evaluation** (dynamic points on Bézier curves)
- **Vector-specific geometry** (vertices, segments, regions)

## How It Works

The feature activates when you:

1. **Hover over a curve segment or vertex** in vector edit mode
2. **Hold the Alt key** while hovering

It uses the same visual system as regular measurements: guide lines, auxiliary lines, and distance labels showing top/right/bottom/left spacing.

### Measurement Triggers

- **Segment hover**: When hovering over a curve segment, measures from selection to the parametric point on the curve
- **Vertex hover**: When hovering over a vertex (snapped), measures from selection to the exact vertex position

## Measurement Types

| A               | A Type    | B                | B Type    | Description                                                                                                |
| --------------- | --------- | ---------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| Vertex          | Vector2   | Parametric Point | Vector2   | Measures axis-aligned distances from a selected vertex to a point on the hovered curve                     |
| Vertex          | Vector2   | Vertex           | Vector2   | Measures axis-aligned distances from a selected vertex to another vertex (when hovering over a vertex)     |
| Vertices (BBox) | Rectangle | Parametric Point | Vector2   | Measures axis-aligned distances from the bounding box of selected vertices to a point on the hovered curve |
| Region (BBox)   | Rectangle | Region (BBox)    | Rectangle | Measures axis-aligned distances between two selected regions                                               |
| Vertex          | Vector2   | Region (BBox)    | Rectangle | Measures axis-aligned distances from a selected vertex to a region's boundary                              |
| Vertices (BBox) | Rectangle | Region (BBox)    | Rectangle | Measures axis-aligned distances from the bounding box of selected vertices to a region's boundary          |

## A-B De-duplication

The measurement system prevents redundant measurements by detecting when the target (B) is already part of the source selection (A). This ensures that measurements are meaningful and avoids measuring a selection against itself.

### De-duplication Rules

| Source Selection (A) | Target (B)                     | Measurement | Reason                                         |
| -------------------- | ------------------------------ | ----------- | ---------------------------------------------- |
| Selected Vertex      | Same Vertex                    | ❌ Skipped  | Cannot measure vertex to itself                |
| Selected Segment     | Vertex of that Segment         | ❌ Skipped  | Target is part of the selected segment         |
| Multiple Vertices    | Any Selected Vertex            | ❌ Skipped  | Target is already in the selection             |
| Multiple Segments    | Vertex of any Selected Segment | ❌ Skipped  | Target is part of one of the selected segments |
| Selected Vertex      | Different Vertex               | ✅ Measured | Valid measurement between distinct points      |
| Selected Segment     | Vertex of Different Segment    | ✅ Measured | Valid measurement between distinct elements    |
| Selected Vertex      | Parametric Point on Curve      | ✅ Measured | Valid measurement to dynamic curve point       |

### Implementation Details

- **Direct Vertex Check**: If the target vertex is directly selected, measurement is skipped
- **Segment Vertex Check**: If the target vertex is an endpoint of any selected segment, measurement is skipped
- **Priority**: Mathematical snapping (`snapped_vertex_idx`) takes precedence over UI hovering (`hovered_vertex_index`)
- **Performance**: Early detection prevents unnecessary calculation of source rectangles and measurements

## Implementation Notes

- **Vector2 points** are treated as zero-size rectangles for consistency with the existing measurement system
- **Curve evaluation** uses `cmath.bezier.evaluate` to calculate dynamic points on Bézier curves
- **Mouse projection** uses `cmath.bezier.project` to find the closest point on the curve to the mouse cursor
- **Vertex detection** uses the `snapped_vertex_idx` state to identify when hovering over a vertex
- **Same visual output** as regular measurements: red guide lines with distance labels
- **Same axis-aligned calculation** showing top, right, bottom, left distances independently
- **Integration** with existing Alt key binding and measurement system
