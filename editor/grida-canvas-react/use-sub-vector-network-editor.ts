import { useCurrentEditor, useEditorState } from "./use-editor";
import { useCallback, useMemo } from "react";
import cmath from "@grida/cmath";
import assert from "assert";
import type grida from "@grida/schema";
import vn from "@grida/vn";

export default function useSurfaceVectorEditor() {
  const instance = useCurrentEditor();
  const state = useEditorState(instance, (state) => {
    const content_edit_mode = state.content_edit_mode;
    assert(content_edit_mode && content_edit_mode.type === "vector");
    const node_id = content_edit_mode.node_id;
    return {
      node_id: content_edit_mode.node_id,
      content_edit_mode: content_edit_mode,
      document: state.document,
      vector_node: state.document.nodes[
        node_id
      ] as grida.program.nodes.VectorNode,
      snapped_vertex_idx: content_edit_mode.snapped_vertex_idx,
      tool: state.tool,
    };
  });

  const { snapped_vertex_idx: snapped_point, tool, vector_node: node } = state;
  const {
    node_id,
    selected_vertices,
    selected_segments,
    selected_tangents,
    a_point,
    path_cursor_position,
    next_ta,
    hovered_control: hovered_controls,
    snapped_segment_p,
  } = state.content_edit_mode;

  const vertices = node.vectorNetwork.vertices;
  const segments = node.vectorNetwork.segments;
  const { selection_neighbouring_vertices: neighbouring_vertices } =
    state.content_edit_mode;

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

  const loops = useMemo(() => {
    const visited = new Set<number>();
    const res: { vertices: number[]; segments: number[] }[] = [];
    for (let si = 0; si < segments.length; si++) {
      if (visited.has(si)) continue;
      const seg = segments[si];
      const loopVertices = [seg.a];
      const loopSegments = [si];
      let currentVertex = seg.b;
      visited.add(si);
      let closed = false;
      while (true) {
        loopVertices.push(currentVertex);
        if (currentVertex === loopVertices[0]) {
          closed = true;
          break;
        }
        const nextIndex = segments.findIndex(
          (s, idx) => !visited.has(idx) && s.a === currentVertex
        );
        if (nextIndex === -1) break;
        loopSegments.push(nextIndex);
        visited.add(nextIndex);
        currentVertex = segments[nextIndex].b;
      }
      if (closed) {
        loopVertices.pop();
        res.push({ vertices: loopVertices, segments: loopSegments });
      }
    }
    return res;
  }, [segments]);

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

  const onSplitSegmentT05 = useCallback(
    (segment: number) => {
      instance.splitSegment(node_id, { segment, t: 0.5 });
      instance.startTranslateVectorNetwork(node_id);
    },
    [instance, node_id, vertices.length]
  );

  const bendSegment = useCallback(
    (
      segment: number,
      ca: number,
      cb: cmath.Vector2,
      frozen: {
        a: cmath.Vector2;
        b: cmath.Vector2;
        ta: cmath.Vector2;
        tb: cmath.Vector2;
      }
    ) => {
      instance.bendSegment(node_id, segment, ca, cb, frozen);
    },
    [instance, node_id]
  );

  const updateHoveredControl = useCallback(
    (hoveredControl: { type: "vertex" | "segment"; index: number } | null) => {
      instance.updateVectorHoveredControl(hoveredControl);
    },
    [instance]
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
      hovered_controls,
      snapped_segment_p,
      selectVertex,
      deleteVertex,
      selectSegment,
      selectTangent,
      deleteSegment,
      onCurveControlPointDragStart,
      onDragStart,
      onSegmentInsertMiddle: onSplitSegmentT05,
      bendSegment,
      updateHoveredControl,
      loops,
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
      hovered_controls,
      snapped_segment_p,
      selectVertex,
      deleteVertex,
      selectSegment,
      selectTangent,
      deleteSegment,
      onCurveControlPointDragStart,
      onDragStart,
      onSplitSegmentT05,
      bendSegment,
      updateHoveredControl,
      loops,
    ]
  );
}
