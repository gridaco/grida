import React, { useCallback, useMemo } from "react";
import cmath from "@grida/cmath";
import {
  useCurrentEditor,
  useEditorState,
  useTransformState,
} from "@/grida-canvas-react";
import { VariableWidthStop } from "./vector-varwidth-stop";
import assert from "assert";
import grida from "@grida/schema";
import vn from "@grida/vn";
import { Curve } from "./vector-cubic-curve";
import { Point } from "./point";

const t = (v: cmath.Vector2, t: cmath.Transform): cmath.Vector2 => {
  return cmath.vector2.transform(v, [
    [t[0][0], t[0][1], 0],
    [t[1][0], t[1][1], 0],
  ]);
};

function useVariableWithEditor() {
  const instance = useCurrentEditor();
  const state = useEditorState(instance, (state) => {
    const content_edit_mode = state.content_edit_mode;
    assert(content_edit_mode && content_edit_mode.type === "width");
    const node_id = content_edit_mode.node_id;
    return {
      node_id: content_edit_mode.node_id,
      content_edit_mode: content_edit_mode,
      document: state.document,
      vector_node: state.document.nodes[
        node_id
      ] as grida.program.nodes.VectorNode,
    };
  });

  const { vector_node: node } = state;
  const {
    node_id,
    // cursor: path_cursor_position
  } = state.content_edit_mode;

  const vertices = node.vectorNetwork.vertices;
  const segments = node.vectorNetwork.segments;
  const {
    variable_width_selected_stop: selected_stop,
    variable_width_profile: profile,
  } = state.content_edit_mode;

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

  const selectStop = useCallback(
    (stop: number) => {
      instance.selectVariableWidthStop(node_id, stop);
    },
    [instance, node_id]
  );

  const deleteStop = useCallback(
    (stop: number) => {
      instance.deleteVariableWidthStop(node_id, stop);
    },
    [instance, node_id]
  );

  const onUDragStart = useCallback(
    (stop: number) => {
      instance.startTranslateVariableWidthStop(node_id, stop);
    },
    [instance, node_id]
  );

  const onRDragStart = useCallback(
    (stop: number, side: "left" | "right") => {
      instance.startResizeVariableWidthStop(node_id, stop, side);
    },
    [instance, node_id]
  );

  return useMemo(() => {
    return {
      profile,
      selected_stop,
      vertices,
      segments,
      absolute_vertices,
      selectStop,
      deleteStop,
      onUDragStart,
      onRDragStart,
    };
  }, [
    profile,
    selected_stop,
    vertices,
    segments,
    absolute_vertices,
    selectStop,
    deleteStop,
    onUDragStart,
    onRDragStart,
  ]);
}

export function SurfaceVariableWidthEditor({ node_id }: { node_id: string }) {
  const { transform } = useTransformState();
  const {
    profile,
    selected_stop,
    segments,
    absolute_vertices,
    selectStop,
    onUDragStart,
    onRDragStart,
  } = useVariableWithEditor();
  //

  return (
    <>
      <div style={{ pointerEvents: "none" }}>
        {segments.map((s, i) => {
          const a = absolute_vertices[s.a];
          const b = absolute_vertices[s.b];
          const ta = s.ta;
          const tb = s.tb;

          return (
            <Curve
              key={i}
              a={cmath.vector2.transform(a, transform)}
              b={cmath.vector2.transform(b, transform)}
              ta={t(ta, transform)}
              tb={t(tb, transform)}
              strokeWidth={1}
              className={"stroke-gray-400"}
            />
          );
        })}

        {absolute_vertices.map((p, i) => {
          return (
            <Point
              key={i}
              tabIndex={0}
              point={cmath.vector2.transform(p, transform)}
              shape="circle"
              size={6}
            />
          );
        })}
      </div>

      {/* DUMMY_VAR_WIDTH_PROFILE surface control */}
      {profile.stops.map((stop, i) => {
        // For now, treat u as t and assume we have a continuous curve
        // We'll need to map u to the actual curve parameter later
        const t_param = stop.u;

        // Find which segment this parameter falls into
        // For simplicity, assume the curve is continuous and map u to segment index
        const totalSegments = segments.length;
        const segmentIndex = Math.floor(t_param * totalSegments);
        const ct = (t_param * totalSegments) % 1;

        if (segmentIndex >= totalSegments) return null;

        const segment = segments[segmentIndex];
        const a = absolute_vertices[segment.a];
        const b = absolute_vertices[segment.b];
        const ta = segment.ta;
        const tb = segment.tb;

        // Evaluate the curve at the given parameter
        const position = cmath.bezier.evaluate(a, b, ta, tb, ct);
        const tangent = cmath.bezier.tangentAt(a, b, ta, tb, ct);

        // Calculate the angle from the tangent
        const angle = Math.atan2(tangent[1], tangent[0]);

        // Transform the position to screen coordinates
        const screen_p = cmath.vector2.transform(position, transform);

        return (
          <VariableWidthStop
            key={`var-width-stop-${i}`}
            u={stop.u}
            p={screen_p}
            angle={angle}
            r={stop.r}
            index={i}
            selected={selected_stop === i}
            onSelect={selectStop}
            onUDragStart={onUDragStart}
            onRDragStart={onRDragStart}
          />
        );
      })}
    </>
  );
}
