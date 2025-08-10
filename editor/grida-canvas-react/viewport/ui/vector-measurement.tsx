import cmath from "@grida/cmath";
import { useTransformState } from "@/grida-canvas-react/provider";
import { useEditorState, useCurrentEditor } from "@/grida-canvas-react";
import { useEffect, useState, useMemo } from "react";
import { measure, Measurement } from "@grida/cmath/_measurement";
import useSurfaceVectorEditor from "../../use-sub-vector-network-editor";
import { MeasurementGuideRenderer } from "./measurement";

/**
 * Pure function to calculate the source rectangle from vector selections.
 *
 * This function determines the bounding box of selected vertices or segments
 * for measurement calculations.
 *
 * @param params - Parameters for source rectangle calculation
 * @returns Rectangle representing the source selection or null if no selection
 */
function getSourceRect(params: {
  selected_vertices: number[];
  selected_segments: number[];
  segments: any[];
  absolute_vertices: cmath.Vector2[];
}): cmath.Rectangle | null {
  const { selected_vertices, selected_segments, segments, absolute_vertices } =
    params;

  if (selected_vertices.length > 0) {
    // Use selected vertices to create bounding box
    const selectedVertexPositions = selected_vertices.map(
      (vertexIndex: number) => absolute_vertices[vertexIndex]
    );
    return cmath.rect.fromPointsOrZero(selectedVertexPositions);
  } else if (selected_segments.length > 0) {
    // Use selected segments to create bounding box
    const selectedSegmentPositions: cmath.Vector2[] = [];
    selected_segments.forEach((segmentIndex: number) => {
      const seg = segments[segmentIndex];
      selectedSegmentPositions.push(absolute_vertices[seg.a]);
      selectedSegmentPositions.push(absolute_vertices[seg.b]);
    });
    return cmath.rect.fromPointsOrZero(selectedSegmentPositions);
  }

  return null;
}

/**
 * Pure function to calculate vector measurement.
 *
 * This function contains the core logic for calculating measurements between
 * vector selections and parametric points on curves or vertices.
 *
 * @param params - Parameters for vector measurement calculation
 * @returns Measurement result or null if conditions not met
 */
function calculateVectorMeasurement(params: {
  hovered_segment_index: number | null;
  snapped_vertex_idx: number | null;
  selected_vertices: number[];
  selected_segments: number[];
  segments: any[];
  absolute_vertices: cmath.Vector2[];
  vertices: cmath.Vector2[];
  local_point: cmath.Vector2;
}): Measurement | null {
  const {
    hovered_segment_index,
    snapped_vertex_idx,
    selected_vertices,
    selected_segments,
    segments,
    absolute_vertices,
    vertices,
    local_point,
  } = params;

  // Only measure when:
  // 1. A segment is hovered OR a vertex is hovered
  // 2. There are selected vertices or segments
  if (
    (hovered_segment_index === null && snapped_vertex_idx === null) ||
    (selected_vertices.length === 0 && selected_segments.length === 0)
  ) {
    return null;
  }

  // Calculate measurement A (selection)
  const a_rect = getSourceRect({
    selected_vertices,
    selected_segments,
    segments,
    absolute_vertices,
  });

  if (!a_rect) {
    return null;
  }

  let b_rect: cmath.Rectangle;

  // Case 1: Vertex-to-vertex measurement (when hovering over a vertex)
  if (snapped_vertex_idx !== null) {
    const targetVertex = absolute_vertices[snapped_vertex_idx];
    b_rect = cmath.rect.quantize(
      { x: targetVertex[0], y: targetVertex[1], width: 0, height: 0 },
      0.01
    );
  }
  // Case 2: Selection-to-parametric-point measurement (when hovering over a segment)
  else if (hovered_segment_index !== null) {
    const segment = segments[hovered_segment_index];

    if (!segment) {
      return null;
    }

    // Project the mouse point onto the curve to get the parametric value
    // For zero-tangent segments, use linear projection since that's what users expect
    const t =
      cmath.vector2.isZero(segment.ta) && cmath.vector2.isZero(segment.tb)
        ? (() => {
            // Linear projection for zero-tangent segments (user expectation)
            const dx = vertices[segment.b][0] - vertices[segment.a][0];
            const dy = vertices[segment.b][1] - vertices[segment.a][1];
            const lenSq = dx * dx + dy * dy;
            if (lenSq === 0) return 0;
            const tLine =
              ((local_point[0] - vertices[segment.a][0]) * dx +
                (local_point[1] - vertices[segment.a][1]) * dy) /
              lenSq;
            return Math.max(0, Math.min(1, tLine));
          })()
        : cmath.bezier.projectParametric(
            vertices[segment.a],
            vertices[segment.b],
            segment.ta,
            segment.tb,
            local_point
          );

    // Evaluate the curve at the projected parametric value
    // For zero-tangent segments, use linear interpolation to match the projection
    const parametricPoint =
      cmath.vector2.isZero(segment.ta) && cmath.vector2.isZero(segment.tb)
        ? cmath.vector2.lerp(
            absolute_vertices[segment.a],
            absolute_vertices[segment.b],
            t
          )
        : cmath.bezier.evaluate(
            absolute_vertices[segment.a],
            absolute_vertices[segment.b],
            segment.ta,
            segment.tb,
            t
          );

    b_rect = cmath.rect.quantize(
      { x: parametricPoint[0], y: parametricPoint[1], width: 0, height: 0 },
      0.01
    );
  } else {
    return null;
  }

  // Use the existing measure function
  const measurementResult = measure(a_rect, b_rect);

  if (measurementResult) {
    return {
      a: a_rect,
      b: b_rect,
      distance: measurementResult.distance,
      box: measurementResult.box,
    };
  }

  return null;
}

/**
 * Hook for vector measurement calculations.
 *
 * This hook integrates with the existing measurement system to provide
 * vector-specific measurements when in vector edit mode with Alt key pressed.
 */
function useVectorMeasurement() {
  const editor = useCurrentEditor();
  const surface_measurement_targeting = useEditorState(
    editor,
    (state) => state.surface_measurement_targeting
  );
  const pointer = useEditorState(editor, (state) => state.pointer);
  const ve = useSurfaceVectorEditor();

  // Memoize the measurement calculation to avoid infinite re-renders
  const measurement = useMemo(() => {
    try {
      // UI concerns: only calculate when measurement is enabled and in vector mode
      if (surface_measurement_targeting !== "on") {
        return undefined;
      }

      // Calculate local point (relative to vector network origin)
      const local_point = cmath.vector2.sub(pointer.position, ve.offset);

      const result = calculateVectorMeasurement({
        hovered_segment_index: ve.hovered_segment_index,
        snapped_vertex_idx: ve.snapped_point,
        selected_vertices: ve.selected_vertices,
        selected_segments: ve.selected_segments,
        segments: ve.segments,
        absolute_vertices: ve.absolute_vertices,
        vertices: ve.vertices,
        local_point,
      });

      return result || undefined;
    } catch (e) {
      console.error("useVectorMeasurement", e);
      return undefined;
    }
  }, [
    surface_measurement_targeting,
    ve.hovered_segment_index,
    ve.snapped_point,
    ve.selected_vertices,
    ve.selected_segments,
    ve.segments,
    ve.absolute_vertices,
    ve.vertices,
    ve.offset,
    pointer.position,
  ]);

  return measurement;
}

/**
 * Vector measurement guide component.
 *
 * Displays measurement guides for vector networks when in vector edit mode
 * with Alt key pressed and a segment is hovered.
 */
export function VectorMeasurementGuide() {
  const measurement = useVectorMeasurement();
  const { transform } = useTransformState();

  if (!measurement) return <></>;

  return (
    <MeasurementGuideRenderer measurement={measurement} transform={transform} />
  );
}
