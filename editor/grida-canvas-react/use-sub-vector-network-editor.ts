import { useCurrentEditor, useEditorState } from "./use-editor";
import { useCallback, useMemo } from "react";
import cmath from "@grida/cmath";
import assert from "assert";
import type grida from "@grida/schema";
import { getUXNeighbouringVertices } from "@/grida-canvas/reducers/methods";
import vn from "@grida/vn";

export default function useSurfaceVectorEditor() {
  const instance = useCurrentEditor();
  const state = useEditorState(instance, (state) => ({
    content_edit_mode: state.content_edit_mode,
    document: state.document,
    snapped_vertex_idx: state.snapped_vertex_idx,
    tool: state.tool,
  }));

  assert(state.content_edit_mode && state.content_edit_mode.type === "vector");

  const { snapped_vertex_idx: snapped_point, tool } = state;
  const {
    node_id,
    selected_vertices,
    selected_segments,
    selected_tangents,
    a_point,
    path_cursor_position,
    next_ta,
  } = state.content_edit_mode;
  const node = state.document.nodes[node_id] as grida.program.nodes.VectorNode;

  const vertices = node.vectorNetwork.vertices;
  const segments = node.vectorNetwork.segments;
  const { neighbouring_vertices } = state.content_edit_mode;

  // offset of the points (node absolute position)
  const absolute = instance.getNodeAbsoluteBoundingRect(node_id);
  const offset: cmath.Vector2 = absolute
    ? [absolute.x, absolute.y]
    : [node.left!, node.top!];

  const vne = useMemo(
    () => new vn.VectorNetworkEditor(node.vectorNetwork),
    [node.vectorNetwork]
  );

  const absolute_vertices = useMemo(
    () => vne.getVerticesAbsolute(offset),
    [vne, offset]
  );

  const absolute_tangents = useMemo(
    () => vne.getControlPointsAbsolute(offset),
    [vne, offset]
  );

  const multi =
    selected_tangents.length > 1 ||
    selected_vertices.length > 0 ||
    selected_segments.length > 0;

  const selectVertex = useCallback(
    (vertex: number, additive?: boolean) => {
      if (tool.type === "path") {
        return;
      }
      instance.selectVertex(node_id, vertex, { additive });
    },
    [tool.type, instance.selectVertex, node_id]
  );

  const deleteVertex = useCallback(
    (vertex: number) => {
      instance.deleteVertex(node_id, vertex);
    },
    [node_id, instance.deleteVertex]
  );

  const onCurveControlPointDragStart = useCallback(
    (segment: number, control: "ta" | "tb") => {
      if (multi) {
        instance.startTranslateVectorNetwork(node_id);
      } else {
        instance.startCurveGesture(node_id, segment, control);
      }
    },
    [multi, instance, node_id]
  );

  const onDragStart = useCallback(() => {
    instance.startTranslateVectorNetwork(node_id);
  }, [instance, node_id]);

  const selectSegment = useCallback(
    (segment: number, additive?: boolean) => {
      instance.selectSegment(node_id, segment, { additive });
    },
    [instance, node_id]
  );

  const selectTangent = useCallback(
    (segment: number, control: "ta" | "tb", additive?: boolean) => {
      const vertex =
        control === "ta" ? segments[segment].a : segments[segment].b;
      instance.selectTangent(node_id, vertex, control === "ta" ? 0 : 1, {
        additive,
      });
    },
    [instance, node_id, segments]
  );

  const deleteSegment = useCallback(
    (segment: number) => {
      instance.deleteSegment(node_id, segment);
    },
    [instance, node_id]
  );

  const onSegmentInsertMiddle = useCallback(
    (segment: number) => {
      instance.splitSegment(node_id, segment);
      instance.startTranslateVectorNetwork(node_id);
    },
    [instance, node_id, vertices.length]
  );

  return useMemo(
    () => ({
      node_id,
      vectorNetwork: node.vectorNetwork,
      path_cursor_position,
      absolute_vertices,
      absolute_tangents,
      vertices,
      segments,
      offset,
      neighbouring_vertices,
      selected_vertices,
      selected_segments,
      selected_tangents,
      snapped_point,
      a_point,
      next_ta,
      selectVertex,
      deleteVertex,
      selectSegment,
      selectTangent,
      deleteSegment,
      onCurveControlPointDragStart,
      onDragStart,
      onSegmentInsertMiddle,
    }),
    [
      //
      node_id,
      node.vectorNetwork,
      path_cursor_position,
      absolute_vertices,
      absolute_tangents,
      vertices,
      segments,
      offset,
      neighbouring_vertices,
      selected_vertices,
      selected_segments,
      selected_tangents,
      snapped_point,
      a_point,
      next_ta,
      selectVertex,
      deleteVertex,
      selectSegment,
      selectTangent,
      deleteSegment,
      onCurveControlPointDragStart,
      onDragStart,
      onSegmentInsertMiddle,
    ]
  );
}
