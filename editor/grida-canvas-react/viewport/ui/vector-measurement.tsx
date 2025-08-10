import { useMemo } from "react";
import { useTransformState } from "@/grida-canvas-react/provider";
import { useEditorState, useCurrentEditor } from "@/grida-canvas-react";
import { measure, Measurement } from "@grida/cmath/_measurement";
import { MeasurementGuideRenderer } from "./measurement";
import vn from "@grida/vn";
import cmath from "@grida/cmath";
import useSurfaceVectorEditor from "../../use-sub-vector-network-editor";

/**
 * Pure function to check if a target vertex is part of the current selection.
 *
 * This function determines if the target vertex (B) is already included in
 * the source selection (A), which would make the measurement redundant.
 *
 * @param params - Parameters for equality check
 * @returns True if the target vertex is part of the selection
 */
function isTargetInSelection(params: {
  targetVertexIndex: number | null;
  selected_vertices: number[];
  selected_segments: number[];
  segments: vn.VectorNetworkSegment[];
}): boolean {
  const { targetVertexIndex, selected_vertices, selected_segments, segments } =
    params;

  if (targetVertexIndex === null) {
    return false;
  }

  // Check if the target vertex is directly selected
  if (selected_vertices.includes(targetVertexIndex)) {
    return true;
  }

  // Check if the target vertex is part of any selected segment
  for (const segmentIndex of selected_segments) {
    const segment = segments[segmentIndex];
    if (
      segment &&
      (segment.a === targetVertexIndex || segment.b === targetVertexIndex)
    ) {
      return true;
    }
  }

  return false;
}

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
  segments: vn.VectorNetworkSegment[];
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
  hovered_controls: { type: "vertex" | "segment"; index: number } | null;
  snapped_vertex_idx: number | null;
  snapped_segment_p: vn.EvaluatedPointOnSegment | null;
  selected_vertices: number[];
  selected_segments: number[];
  segments: vn.VectorNetworkSegment[];
  absolute_vertices: cmath.Vector2[];
  vertices: cmath.Vector2[];
  local_point: cmath.Vector2;
  offset: cmath.Vector2;
}): Measurement | null {
  const {
    hovered_controls,
    snapped_vertex_idx,
    snapped_segment_p,
    selected_vertices,
    selected_segments,
    segments,
    absolute_vertices,
    vertices,
    local_point,
    offset,
  } = params;

  // Only measure when:
  // 1. A segment is hovered OR a vertex is hovered (snapped or UI hovered)
  // 2. There are selected vertices or segments
  // 3. The target is not part of the current selection (A !== B)
  const targetVertexIndex =
    snapped_vertex_idx ??
    (hovered_controls?.type === "vertex" ? hovered_controls.index : null);
  if (
    (hovered_controls?.type !== "segment" && targetVertexIndex === null) ||
    (selected_vertices.length === 0 && selected_segments.length === 0)
  ) {
    return null;
  }

  // Skip measurement if the target vertex is part of the current selection
  if (
    targetVertexIndex !== null &&
    isTargetInSelection({
      targetVertexIndex,
      selected_vertices,
      selected_segments,
      segments,
    })
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
  if (targetVertexIndex !== null) {
    const targetVertex = absolute_vertices[targetVertexIndex];
    b_rect = cmath.rect.quantize(
      { x: targetVertex[0], y: targetVertex[1], width: 0, height: 0 },
      0.01
    );
  }
  // Case 2: Selection-to-parametric-point measurement (when hovering over a segment)
  else if (hovered_controls?.type === "segment") {
    const segment = segments[hovered_controls.index];

    if (!segment) {
      return null;
    }

    // Use pre-computed snapped segment point
    if (
      !snapped_segment_p ||
      snapped_segment_p.segment !== hovered_controls.index
    ) {
      return null;
    }

    // Use the pre-computed point directly (convert from local to absolute coordinates)
    const parametricPoint = cmath.vector2.add(snapped_segment_p.point, offset);

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
        hovered_controls: ve.hovered_controls,
        snapped_vertex_idx: ve.snapped_point,
        snapped_segment_p: ve.snapped_segment_p,
        selected_vertices: ve.selected_vertices,
        selected_segments: ve.selected_segments,
        segments: ve.segments,
        absolute_vertices: ve.absolute_vertices,
        vertices: ve.vertices,
        local_point,
        offset: ve.offset,
      });

      return result || undefined;
    } catch (e) {
      console.error("useVectorMeasurement", e);
      return undefined;
    }
  }, [
    surface_measurement_targeting,
    ve.hovered_controls,
    ve.snapped_point,
    ve.snapped_segment_p,
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
