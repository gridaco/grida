import { type Draft } from "immer";

import type {
  EditorEventTarget_PointerDown,
  EditorEventTarget_DragStart,
} from "../action";
import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import grida from "@grida/schema";
import assert from "assert";
import {
  getUXNeighbouringVertices,
  self_updateVectorSnappedSegmentP,
} from "./methods/vector";
import {
  self_try_insert_node,
  self_selectNode,
  self_select_tool,
  self_clearSelection,
} from "./methods";
import { getInitialCurveGesture } from "./tools/gesture";
import { threshold, snapMovement } from "./tools/snap";
import { snapToCanvasGeometry } from "@grida/cmath/_snap";
import cmath from "@grida/cmath";
import kolor from "@grida/color";
import vn from "@grida/vn";
import type { ReducerContext } from ".";

/**
 * Computes segment snapping for vector content edit mode.
 *
 * This function calculates the parametric position on a hovered segment
 * when the pointer is close enough to snap to it. Only computes when
 * no vertex is snapped and there's a hovered segment for performance.
 *
 * @param draft - The editor state draft to modify
 * @param logical_pos - The logical pointer position in canvas space
 * @param rect - The node's absolute bounding rectangle
 * @param node - The vector node being edited
 */
function __self_compute_vector_segment_snapping<
  S extends editor.state.IEditorState,
>(
  draft: Draft<S>,
  logical_pos: cmath.Vector2,
  rect: cmath.Rectangle,
  node: grida.program.nodes.VectorNode
) {
  assert(draft.content_edit_mode?.type === "vector");

  // we rely on ui's hover state for early exit and to save computation
  // if this is still expensive, we can block it by tool.type === "path" (since its only used when path tool is active)
  if (draft.content_edit_mode.hovered_control?.type === "segment") {
    // Calculate local point (relative to vector network origin)
    const local_point = cmath.vector2.sub(logical_pos, [rect.x, rect.y]);

    const segment_index = draft.content_edit_mode.hovered_control.index;
    const segment = node.vector_network.segments[segment_index];
    const a = node.vector_network.vertices[segment.a];
    const b = node.vector_network.vertices[segment.b];
    const ta = segment.ta;
    const tb = segment.tb;

    // Project the point onto the segment
    const t = cmath.bezier.project(a, b, ta, tb, local_point);

    // Evaluate the curve at the projected parametric value
    const parametricPoint = cmath.bezier.evaluate(a, b, ta, tb, t);

    // Calculate distance to the projected point
    const distance = cmath.vector2.distance(local_point, parametricPoint);

    // Check if within threshold
    const segment_snap_threshold = threshold(10, draft.transform);
    if (distance <= segment_snap_threshold) {
      self_updateVectorSnappedSegmentP(draft, {
        segment: segment_index,
        t,
        point: parametricPoint,
      });
    } else {
      self_updateVectorSnappedSegmentP(draft, null);
    }
  } else {
    // Clear segment snapping when vertex is snapped or no hovered segment
    if (draft.content_edit_mode?.type === "vector") {
      draft.content_edit_mode.snapped_segment_p = null;
    }
  }
}

export function on_pointer_move(
  draft: editor.state.IEditorState,
  canvas_space_pointer_position: cmath.Vector2,
  context: ReducerContext
) {
  assert(draft.content_edit_mode?.type === "vector");
  const { a_point, node_id } = draft.content_edit_mode;
  const { tarnslate_with_axis_lock, translate_with_force_disable_snap } =
    draft.gesture_modifiers;

  let logical_pos = canvas_space_pointer_position;

  if (typeof a_point === "number" && tarnslate_with_axis_lock === "on") {
    const node = dq.__getNodeById(
      draft,
      node_id
    ) as grida.program.nodes.VectorNode;
    const rect = context.geometry.getNodeAbsoluteBoundingRect(node_id)!;
    const n_offset: cmath.Vector2 = [rect.x, rect.y];
    const { vertices } = node.vector_network;
    const a = vertices[a_point];

    const movement = cmath.vector2.sub(
      draft.pointer.position,
      cmath.vector2.add(n_offset, a)
    );

    const adj_movement = cmath.ext.movement.axisLockedByDominance(movement);

    logical_pos = cmath.vector2.add(
      a,
      cmath.ext.movement.normalize(adj_movement),
      n_offset
    );
  }

  draft.pointer.logical = logical_pos;

  const node = dq.__getNodeById(
    draft,
    node_id
  ) as grida.program.nodes.VectorNode;
  const rect = context.geometry.getNodeAbsoluteBoundingRect(node_id)!;
  const anchor_points = node.vector_network.vertices.map((v) =>
    cmath.vector2.add(v, [rect.x, rect.y])
  );

  const should_snap =
    translate_with_force_disable_snap !== "on" && anchor_points.length > 0;

  if (should_snap) {
    const t = threshold(5, draft.transform);
    const res = snapToCanvasGeometry(
      [logical_pos],
      { points: anchor_points },
      { x: t, y: t }
    );
    draft.content_edit_mode.cursor = res.by_points
      ? res.by_points.translated[0]
      : logical_pos;
    draft.surface_snapping = res;
    if (res.by_points) {
      const idx = res.by_points.hit_points.anchors.findIndex(
        ([xhit, yhit]) => xhit && yhit
      );
      draft.content_edit_mode.snapped_vertex_idx = idx !== -1 ? idx : null;
    } else {
      draft.content_edit_mode.snapped_vertex_idx = null;
    }

    // Compute segment snapping if no vertex is snapped and there's a hovered segment
    if (draft.content_edit_mode.snapped_vertex_idx === null) {
      __self_compute_vector_segment_snapping(draft, logical_pos, rect, node);
      // Update path cursor position to use snapped segment point if available
      if (draft.content_edit_mode.snapped_segment_p) {
        const snapped_point = draft.content_edit_mode.snapped_segment_p.point;
        // Convert local point to absolute coordinates
        draft.content_edit_mode.cursor = cmath.vector2.add(snapped_point, [
          rect.x,
          rect.y,
        ]);
      }
    }
  } else {
    draft.content_edit_mode.cursor = logical_pos;
    draft.surface_snapping = undefined;
    draft.content_edit_mode.snapped_vertex_idx = null;
  }
}

/**
 * Handles path tool pointer down events in vector edit mode
 */
export function on_path_pointer_down(
  draft: editor.state.IEditorState,
  action: EditorEventTarget_PointerDown,
  context: ReducerContext
) {
  assert(draft.content_edit_mode?.type === "vector");
  const { snapped_vertex_idx: snapped_point, snapped_segment_p } =
    draft.content_edit_mode;
  const { node_id, cursor, a_point, next_ta } = draft.content_edit_mode;

  const node = dq.__getNodeById(
    draft,
    node_id
  ) as grida.program.nodes.VectorNode;

  const vne = new vn.VectorNetworkEditor(node.vector_network);

  // Handle snapped segment point - split the segment and start/finish at the split point
  if (snapped_segment_p) {
    const split_vertex_idx = vne.splitSegment(snapped_segment_p);

    // Update node bounds after splitting
    const bb_b = vne.getBBox();
    const delta: cmath.Vector2 = [bb_b.x, bb_b.y];
    vne.translate(cmath.vector2.invert(delta));
    const new_pos = cmath.vector2.add([node.left!, node.top!], delta);
    node.left = new_pos[0];
    node.top = new_pos[1];
    node.width = bb_b.width;
    node.height = bb_b.height;
    node.vector_network = vne.value;

    if (typeof a_point !== "number") {
      // Starting a new path at the split point
      draft.content_edit_mode.selection = {
        selected_vertices: [split_vertex_idx],
        selected_segments: [],
        selected_tangents: [],
      };
      draft.content_edit_mode.selection_neighbouring_vertices =
        getUXNeighbouringVertices(
          node.vector_network,
          draft.content_edit_mode.selection
        );
      draft.content_edit_mode.a_point = split_vertex_idx;
      draft.content_edit_mode.next_ta =
        vne.getNextMirroredTangent(split_vertex_idx);
    } else {
      // Finishing the path at the split point
      const new_vertex_idx = vne.addVertex(
        snapped_segment_p.point,
        a_point,
        next_ta ?? undefined
      );

      const new_segment_idx = vne.segments.length - 1;

      // clear the next ta as it's used
      draft.content_edit_mode.next_ta = null;

      // Update bounds again after adding vertex
      const bb_b2 = vne.getBBox();
      const delta2: cmath.Vector2 = [bb_b2.x, bb_b2.y];
      vne.translate(cmath.vector2.invert(delta2));
      const new_pos2 = cmath.vector2.add([node.left!, node.top!], delta2);
      node.left = new_pos2[0];
      node.top = new_pos2[1];
      node.width = bb_b2.width;
      node.height = bb_b2.height;
      node.vector_network = vne.value;

      draft.content_edit_mode.selection.selected_vertices = [new_vertex_idx];
      draft.content_edit_mode.selection.selected_tangents = [];

      const isClosingExisting = new_vertex_idx === split_vertex_idx;

      // when connecting to an existing vertex, keep the new segment
      // selected so dragging starts a "curve-b" gesture. conclude
      // projection by clearing `a_point` unless the user keeps
      // projecting with the `p` modifier.
      draft.content_edit_mode.selection.selected_segments =
        new_segment_idx !== null ? [new_segment_idx] : [];

      if (
        isClosingExisting &&
        draft.gesture_modifiers.path_keep_projecting !== "on"
      ) {
        draft.content_edit_mode.a_point = null;
      } else {
        draft.content_edit_mode.a_point = new_vertex_idx;
      }
    }
    // Clear the snapped segment point after using it
    draft.content_edit_mode.snapped_segment_p = null;
    return;
  }

  // Handle snapped vertex (existing logic)
  if (typeof a_point !== "number" && typeof snapped_point === "number") {
    draft.content_edit_mode.selection = {
      selected_vertices: [snapped_point],
      selected_segments: [],
      selected_tangents: [],
    };
    draft.content_edit_mode.selection_neighbouring_vertices =
      getUXNeighbouringVertices(node.vector_network, {
        selected_vertices: [snapped_point],
        selected_segments: [],
        selected_tangents: [],
      });
    draft.content_edit_mode.a_point = snapped_point;
    draft.content_edit_mode.next_ta = vne.getNextMirroredTangent(snapped_point);
    return;
  }

  const position =
    typeof snapped_point === "number"
      ? node.vector_network.vertices[snapped_point]
      : // relative position (absolute -> local)
        (() => {
          const rect = context.geometry.getNodeAbsoluteBoundingRect(node_id)!;
          return cmath.vector2.sub(cursor, [rect.x, rect.y]);
        })();

  const new_vertex_idx = vne.addVertex(position, a_point, next_ta ?? undefined);

  const new_segment_idx =
    typeof a_point === "number" ? vne.segments.length - 1 : null;

  // clear the next ta as it's used
  draft.content_edit_mode.next_ta = null;

  const bb_b = vne.getBBox();

  const delta: cmath.Vector2 = [bb_b.x, bb_b.y];
  vne.translate(cmath.vector2.invert(delta));

  const new_pos = cmath.vector2.add([node.left!, node.top!], delta);

  node.left = new_pos[0];
  node.top = new_pos[1];
  node.width = bb_b.width;
  node.height = bb_b.height;

  node.vector_network = vne.value;
  draft.content_edit_mode.selection.selected_vertices = [new_vertex_idx];
  draft.content_edit_mode.selection.selected_tangents = [];

  const isClosingExisting =
    typeof snapped_point === "number" && new_vertex_idx === snapped_point;

  // when connecting to an existing vertex, keep the new segment
  // selected so dragging starts a "curve-b" gesture. conclude
  // projection by clearing `a_point` unless the user keeps
  // projecting with the `p` modifier.
  draft.content_edit_mode.selection.selected_segments =
    new_segment_idx !== null ? [new_segment_idx] : [];

  if (
    isClosingExisting &&
    draft.gesture_modifiers.path_keep_projecting !== "on"
  ) {
    draft.content_edit_mode.a_point = null;
  } else {
    draft.content_edit_mode.a_point = new_vertex_idx;
  }
}

/**
 * Creates a new vector node for path tool
 */
export function create_new_vector_node(
  draft: editor.state.IEditorState,
  context: ReducerContext
) {
  const new_node_id = context.idgen.next();

  const vector = {
    type: "vector",
    name: "vector",
    id: new_node_id,
    active: true,
    locked: false,
    position: "absolute",
    left: 0,
    top: 0,
    opacity: 1,
    width: 0,
    height: 0,
    rotation: 0,
    z_index: 0,
    stroke: {
      type: "solid",
      color: kolor.colorformats.RGBA32F.BLACK,
      active: true,
    },
    stroke_width: 1,
    stroke_cap: "butt",
    stroke_join: "miter",
    vector_network: {
      vertices: [cmath.vector2.zero],
      segments: [],
    },
  } satisfies grida.program.nodes.VectorNode;

  const pos = draft.pointer.position;

  const parent = __get_insertion_target(draft);

  let relpos = pos;
  if (parent) {
    const parent_rect = context.geometry.getNodeAbsoluteBoundingRect(parent)!;
    relpos = cmath.vector2.sub(pos, [parent_rect.x, parent_rect.y]);
  }

  vector.left = relpos[0];
  vector.top = relpos[1];

  self_try_insert_node(draft, parent, vector);
  self_selectNode(draft, "reset", vector.id);

  draft.content_edit_mode = {
    type: "vector",
    node_id: new_node_id,
    selection: {
      selected_vertices: [0], // select the first point
      selected_segments: [],
      selected_tangents: [],
    },
    a_point: 0,
    next_ta: null,
    initial_vector_network: vector.vector_network,
    original: null,
    selection_neighbouring_vertices: [0],
    cursor: pos,
    clipboard: null,
    clipboard_node_position: null,
    hovered_control: null,
    snapped_vertex_idx: null,
    snapped_segment_p: null,
  };
}

/**
 * Handles path tool drag start events
 */
export function on_path_drag_start(
  draft: editor.state.IEditorState,
  action: EditorEventTarget_DragStart,
  context: ReducerContext
) {
  assert(draft.content_edit_mode?.type === "vector");
  const {
    node_id,
    selection: { selected_vertices, selected_segments },
  } = draft.content_edit_mode;
  assert(selected_vertices.length === 1);
  const vertex = selected_vertices[0];

  if (selected_segments.length === 1) {
    const segment_idx = selected_segments[0];
    draft.content_edit_mode.selection.selected_segments = [];

    const gesture = getInitialCurveGesture(draft, {
      node_id,
      segment: segment_idx,
      control: "tb",
      invert: true,
    });

    draft.gesture = gesture;
  } else {
    draft.gesture = {
      type: "curve-a",
      node_id,
      vertex,
      control: "ta",
      initial: cmath.vector2.zero,
      movement: cmath.vector2.zero,
      first: cmath.vector2.zero,
      last: cmath.vector2.zero,
      invert: false,
    };
  }
}

/**
 * Handles curve gesture during drag
 */
export function on_drag_gesture_curve(
  draft: editor.state.IEditorState,
  context: ReducerContext
) {
  assert(draft.content_edit_mode?.type === "vector");
  assert(draft.gesture.type === "curve");
  const { node_id, segment, initial, control, invert } = draft.gesture;
  const { movement } = draft.gesture;

  const node = dq.__getNodeById(
    draft,
    node_id
  ) as grida.program.nodes.VectorNode;

  const { vector_network } = node;
  const vne = new vn.VectorNetworkEditor(vector_network);

  const rect = context.geometry.getNodeAbsoluteBoundingRect(node_id)!;
  const node_pos_abs: cmath.Vector2 = [rect.x, rect.y];

  const vertex_index = vne.segments[segment][control === "ta" ? "a" : "b"];
  const vertex_local = vne.vertices[vertex_index];
  const vertex_abs = cmath.vector2.add(vertex_local, node_pos_abs);
  const agent_initial = cmath.vector2.add(vertex_abs, initial);

  const anchor_points = vne.vertices.map((v) =>
    cmath.vector2.add(v, node_pos_abs)
  );
  const scene = draft.document.nodes[
    draft.scene_id!
  ] as grida.program.nodes.SceneNode;

  const { tarnslate_with_axis_lock, translate_with_force_disable_snap } =
    draft.gesture_modifiers;

  const adj_movement =
    tarnslate_with_axis_lock === "on"
      ? cmath.ext.movement.axisLockedByDominance([movement[0], movement[1]])
      : ([movement[0], movement[1]] as cmath.ext.movement.Movement);

  const should_snap = translate_with_force_disable_snap !== "on";

  const { movement: snappedMovement, snapping } = snapMovement(
    [agent_initial],
    { points: anchor_points, guides: scene.guides },
    adj_movement,
    threshold(
      editor.config.DEFAULT_SNAP_MOVEMNT_THRESHOLD_FACTOR,
      draft.transform
    ),
    should_snap
  );

  draft.surface_snapping = snapping;

  const snapped_vec = cmath.ext.movement.normalize(snappedMovement);
  const tangentPos = cmath.vector2.add(
    initial,
    invert ? cmath.vector2.invert(snapped_vec) : snapped_vec
  );

  vne.updateTangent(
    segment,
    control,
    tangentPos,
    draft.gesture_modifiers.curve_tangent_mirroring
  );

  if (segment === vne.segments.length - 1) {
    // TODO: add a new "curve-b" and make it isolated from control point editing.
    // on drawing mode - this should be true.
    // on control point edit mode, this should be false
    // if last segment, update the next ta as mirror of the tangent
    draft.content_edit_mode.next_ta = cmath.vector2.invert(tangentPos);
  }

  // TODO: try consider updating the transform on drag end as it could be expensive

  const bb = vne.getBBox();
  const delta: cmath.Vector2 = [bb.x, bb.y];

  vne.translate(cmath.vector2.invert(delta));

  const new_pos = cmath.vector2.add([node.left!, node.top!], delta);

  node.left = new_pos[0];
  node.top = new_pos[1];
  node.width = bb.width;
  node.height = bb.height;

  node.vector_network = vne.value;
}

/**
 * Handles curve-a gesture during drag
 */
export function on_drag_gesture_curve_a(draft: editor.state.IEditorState) {
  assert(draft.content_edit_mode?.type === "vector");
  assert(draft.gesture.type === "curve-a");
  const { initial, invert } = draft.gesture;
  const { movement } = draft.gesture;

  const tangentPos = cmath.vector2.add(
    initial,
    invert ? cmath.vector2.invert(movement) : movement
  );

  draft.content_edit_mode.next_ta = tangentPos;
}

/**
 * Handles translate-vector-controls gesture during drag
 */
export function on_drag_gesture_translate_vector_controls(
  draft: editor.state.IEditorState
) {
  assert(draft.content_edit_mode?.type === "vector");
  assert(draft.gesture.type === "translate-vector-controls");
  const { content_edit_mode } = draft;
  const { node_id } = content_edit_mode;
  const node = dq.__getNodeById(
    draft,
    node_id
  ) as grida.program.nodes.VectorNode;

  const { movement: _movement } = draft.gesture;

  const { tarnslate_with_axis_lock, translate_with_force_disable_snap } =
    draft.gesture_modifiers;
  const should_snap = translate_with_force_disable_snap !== "on";
  const adj_movement =
    tarnslate_with_axis_lock === "on"
      ? cmath.ext.movement.axisLockedByDominance(_movement)
      : _movement;

  const {
    initial_verticies,
    initial_segments,
    initial_position,
    initial_absolute_position,
    vertices,
    tangents,
  } = draft.gesture;

  const scene = draft.document.nodes[
    draft.scene_id!
  ] as grida.program.nodes.SceneNode;

  const agent_points = vertices.map((i) =>
    cmath.vector2.add(initial_verticies[i], initial_absolute_position)
  );
  const anchor_points = initial_verticies
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => !vertices.includes(i))
    .map(({ p }) => cmath.vector2.add(p, initial_absolute_position));

  const { movement: snappedMovement, snapping } = snapMovement(
    agent_points,
    { points: anchor_points, guides: scene.guides },
    adj_movement,
    threshold(
      editor.config.DEFAULT_SNAP_MOVEMNT_THRESHOLD_FACTOR,
      draft.transform
    ),
    should_snap
  );

  draft.surface_snapping = snapping;

  const vne = new vn.VectorNetworkEditor({
    vertices: initial_verticies.map((p) => p),
    segments: initial_segments.map((s) => ({ ...s })),
  });

  const bb_a = vne.getBBox();

  const delta_vec = cmath.ext.movement.normalize(snappedMovement);

  for (const i of vertices) {
    vne.translateVertex(i, delta_vec);
  }
  for (const [v_idx, t_idx] of tangents) {
    const point = t_idx === 0 ? "a" : "b";
    for (const si of vne.findSegments(v_idx, point)) {
      const seg = vne.segments[si];
      const control = t_idx === 0 ? "ta" : "tb";
      const next = cmath.vector2.add(seg[control], delta_vec);
      vne.updateTangent(si, control, next, "none");
    }
  }

  const bb_b = vne.getBBox();

  const delta = cmath.vector2.sub([bb_b.x, bb_b.y], [bb_a.x, bb_a.y]);

  vne.translate(cmath.vector2.invert(delta));

  const new_pos = cmath.vector2.add(initial_position, delta);
  node.left = new_pos[0];
  node.top = new_pos[1];
  node.width = bb_b.width;
  node.height = bb_b.height;

  node.vector_network = vne.value;
}

/**
 * Handles draw tool pointer down events
 */
export function on_draw_pointer_down(
  draft: editor.state.IEditorState,
  context: ReducerContext
) {
  assert(draft.tool.type === "draw");
  const tool = draft.tool.tool;

  let vector: grida.program.nodes.VectorNode;

  const new_node_id = context.idgen.next();
  const __base = {
    id: new_node_id,
    active: true,
    locked: false,
    position: "absolute",
    left: 0,
    top: 0,
    opacity: 1,
    width: 0,
    height: 0,
    rotation: 0,
    z_index: 0,
    stroke: {
      type: "solid",
      color: kolor.colorformats.RGBA32F.BLACK,
      active: true,
    },
    stroke_cap: "butt",
  } as const;

  switch (tool) {
    case "pencil": {
      vector = {
        ...__base,
        type: "vector",
        name: "vector",
        stroke_width: 3,
        stroke_join: "miter",
        vector_network: vn.polyline([cmath.vector2.zero]),
      } satisfies grida.program.nodes.VectorNode;
      break;
    }
    case "line": {
      // vector = {
      //   ...__base,
      //   type: "line",
      //   name: "line",
      // } satisfies grida.program.nodes.LineNode;

      vector = {
        ...__base,
        type: "vector",
        name: "line",
        stroke_width: 1,
        stroke_join: "miter",
        vector_network: vn.polyline([cmath.vector2.zero]),
      } satisfies grida.program.nodes.VectorNode;
      break;
    }
  }

  // insert a new vector node
  const parent = __get_insertion_target(draft);
  self_try_insert_node(draft, parent, vector);

  // position relative to the parent
  let node_relative_pos = draft.pointer.position;
  if (parent) {
    const parent_rect = context.geometry.getNodeAbsoluteBoundingRect(parent)!;
    node_relative_pos = cmath.vector2.sub(draft.pointer.position, [
      parent_rect.x,
      parent_rect.y,
    ]);
  }

  vector.left = node_relative_pos[0];
  vector.top = node_relative_pos[1];

  draft.gesture = {
    type: "draw",
    mode: tool,
    origin: node_relative_pos,
    movement: cmath.vector2.zero,
    first: cmath.vector2.zero,
    last: cmath.vector2.zero,
    points: [cmath.vector2.zero],
    node_id: vector.id,
  };

  // selection & hover state
  switch (tool) {
    case "line":
      // self_selectNode(draft, "reset", vector.id);
      self_clearSelection(draft);
      break;
    case "pencil":
      // clear selection for pencil mode
      self_clearSelection(draft);
      break;
  }
}

/**
 * Handles draw gesture during drag
 */
export function on_drag_gesture_draw(
  draft: editor.state.IEditorState,
  movement: cmath.Vector2
) {
  assert(draft.gesture.type === "draw");
  const {
    gesture_modifiers: { tarnslate_with_axis_lock },
  } = draft;

  const adj_movement =
    tarnslate_with_axis_lock === "on"
      ? cmath.ext.movement.axisLockedByDominance(movement)
      : movement;

  const point = cmath.ext.movement.normalize(adj_movement);

  const mode = draft.gesture.mode;

  const { origin, points, node_id } =
    draft.gesture as editor.gesture.GestureDraw;

  const node = dq.__getNodeById(
    draft,
    node_id
  ) as grida.program.nodes.VectorNode;

  const vne = new vn.VectorNetworkEditor({
    vertices: points.map((p) => p),
    segments: node.vector_network.segments,
  });

  switch (mode) {
    case "line":
      vne.extendLine(point);
      break;
    case "pencil":
      vne.extendPolyline(point);
      break;
  }

  draft.gesture.points = vne.value.vertices.map((v) => v);

  // get the box of the points
  const bb = vne.getBBox();
  const raw_offset: cmath.Vector2 = [bb.x, bb.y];
  // snap/round the offset so it doesn't keep producing sub-pixel re-centers
  const snapped_offset = cmath.vector2.quantize(raw_offset, 1);

  vne.translate(cmath.vector2.invert(snapped_offset));

  const new_pos = cmath.vector2.add(origin, snapped_offset);
  node.left = new_pos[0];
  node.top = new_pos[1];
  node.width = bb.width;
  node.height = bb.height;
  node.vector_network = vne.value;
}

/**
 * Handles draw tool drag end events
 */
export function on_draw_drag_end(
  draft: editor.state.IEditorState,
  context: ReducerContext
) {
  // keep if pencil mode
  if (draft.tool.type === "draw" && draft.tool.tool === "pencil") return;

  // For line mode, switch back to cursor tool
  self_select_tool(draft, { type: "cursor" }, context);
}

// Helper function - needs to be imported or defined
function __get_insertion_target(
  state: editor.state.IEditorState
): string | null {
  assert(state.scene_id, "scene_id is not set");
  const scene = state.document.nodes[
    state.scene_id
  ] as grida.program.nodes.SceneNode;
  const scene_children = state.document.links[state.scene_id] || [];
  if (scene.constraints.children === "single") {
    return scene_children[0];
  }

  const hits = state.hits.slice();
  for (const hit of hits) {
    const node = dq.__getNodeById(state, hit);
    if (node.type === "container") return hit;
  }
  return null;
}
