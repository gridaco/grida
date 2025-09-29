import { useCurrentEditor, useEditorState } from "./use-editor";
import { useCallback, useMemo } from "react";
import cmath from "@grida/cmath";
import assert from "assert";
import type grida from "@grida/schema";
import vn from "@grida/vn";
import { editor } from "@/grida-canvas";

export interface AbsoluteVectorNetworkGeometry {
  network: vn.VectorNetwork;
  vertices: cmath.Vector2[];
  segments: vn.VectorNetworkSegment[];
  absolute_vertices: cmath.Vector2[];
  absolute_tangents: vn.AbsoluteTangentControlOnSegment[];
}

export interface VectorContentEditor extends AbsoluteVectorNetworkGeometry {
  node_id: string;
  path_cursor_position: cmath.Vector2;
  offset: cmath.Vector2;
  neighbouring_vertices: editor.state.VectorContentEditMode["selection_neighbouring_vertices"];
  selected_vertices: editor.state.VectorContentEditMode["selection"]["selected_vertices"];
  selected_segments: editor.state.VectorContentEditMode["selection"]["selected_segments"];
  selected_tangents: editor.state.VectorContentEditMode["selection"]["selected_tangents"];
  snapped_point: editor.state.VectorContentEditMode["snapped_vertex_idx"];
  a_point: editor.state.VectorContentEditMode["a_point"];
  next_ta: editor.state.VectorContentEditMode["next_ta"];
  hovered_control: editor.state.VectorContentEditMode["hovered_control"];
  snapped_segment_p: editor.state.VectorContentEditMode["snapped_segment_p"];
  loops: vn.Loop[];
  selectVertex: (vertex: number, additive?: boolean) => void;
  deleteVertex: (vertex: number) => void;
  selectSegment: (segment: number, additive?: boolean) => void;
  selectTangent: (
    segment: number,
    control: "ta" | "tb",
    additive?: boolean
  ) => void;
  deleteSegment: (segment: number) => void;
  onCurveControlPointDragStart: (segment: number, control: "ta" | "tb") => void;
  onDragStart: () => void;
  onSegmentInsertMiddle: (segment: number) => void;
  bendSegment: (
    segment: number,
    ca: number,
    cb: cmath.Vector2,
    frozen: {
      a: cmath.Vector2;
      b: cmath.Vector2;
      ta: cmath.Vector2;
      tb: cmath.Vector2;
    }
  ) => void;
  updateHoveredControl: (
    hoveredControl: { type: "vertex" | "segment"; index: number } | null
  ) => void;
  getLoopPathData: (loop: vn.Loop) => string;
  selectLoop: (loop: vn.Loop) => void;
}

export default function useVectorContentEditMode(): VectorContentEditor {
  const instance = useCurrentEditor();
  const state = useEditorState(instance, (state) => {
    const content_edit_mode = state.content_edit_mode;
    assert(content_edit_mode && content_edit_mode.type === "vector");
    const node_id = content_edit_mode.node_id;
    return {
      node_id: content_edit_mode.node_id,
      content_edit_mode: content_edit_mode,
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
    selection: { selected_vertices, selected_segments, selected_tangents },
    a_point,
    cursor: path_cursor_position,
    next_ta,
    hovered_control,
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
    return vne.getLoops();
  }, [vne]);

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
        instance.surfaceStartTranslateVectorNetwork(node_id);
      } else {
        instance.surfaceStartCurveGesture(node_id, segment, control);
      }
    },
    [multi, instance, node_id]
  );

  const onDragStart = useCallback(() => {
    instance.surfaceStartTranslateVectorNetwork(node_id);
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
      instance.surfaceStartTranslateVectorNetwork(node_id);
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
      instance.surfaceUpdateVectorHoveredControl(hoveredControl);
    },
    [instance]
  );

  const getLoopPathData = useCallback(
    (loop: vn.Loop) => {
      return vne.getLoopPathData(loop);
    },
    [vne]
  );

  const selectLoop = useCallback(
    (loop: vn.Loop) => {
      if (loop.length === 0) return;
      instance.selectSegment(node_id, loop[0], { additive: false });
      for (let i = 1; i < loop.length; i++) {
        instance.selectSegment(node_id, loop[i], { additive: true });
      }
    },
    [instance, node_id]
  );

  return useMemo(
    () => ({
      node_id,
      network: node.vectorNetwork,
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
      hovered_control,
      snapped_segment_p,
      loops,
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
      getLoopPathData,
      selectLoop,
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
      hovered_control,
      snapped_segment_p,
      loops,
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
      getLoopPathData,
      selectLoop,
    ]
  );
}
