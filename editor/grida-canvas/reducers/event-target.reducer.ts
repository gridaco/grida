import { produce, type Draft } from "immer";

import type {
  EventTargetAction,
  //
  EditorEventTarget_PointerMove,
  EditorEventTarget_PointerMoveRaycast,
  EditorEventTarget_PointerDown,
  EditorEventTarget_Click,
  //
  EditorEventTarget_Drag,
  EditorEventTarget_DragStart,
  EditorEventTarget_DragEnd,
  EditorEventTarget_MultipleSelectionLayer_Click,
} from "../action";
import { editor } from "@/grida-canvas";
import grida from "@grida/schema";
import nodeReducer from "./node.reducer";
import initialNode from "./tools/initial-node";
import assert from "assert";
import {
  self_clearSelection,
  self_try_insert_node,
  self_selectNode,
  self_updateSurfaceHoverState,
  self_update_gesture_transform,
} from "./methods";
import { cmath } from "@grida/cmath";
import { domapi } from "../backends/dom";
import nid from "./tools/id";
import { getMarqueeSelection, getRayTarget } from "./tools/target";
import vn from "@grida/vn";
import { getInitialCurveGesture } from "./tools/gesture";
import { snapGuideTranslation, threshold } from "./tools/snap";
import { BitmapLayerEditor } from "@grida/bitmap";
import cg from "@grida/cg";

const black = { r: 0, g: 0, b: 0, a: 1 };

function __self_evt_on_pointer_move(
  draft: editor.state.IEditorState,
  action: EditorEventTarget_PointerMove
) {
  const {
    position_canvas: { x, y },
    position_client,
  } = <EditorEventTarget_PointerMove>action;

  const surface_space_pointer_position: cmath.Vector2 = [x, y];

  const canvas_space_pointer_position = cmath.vector2.transform(
    surface_space_pointer_position,
    cmath.transform.invert(draft.transform)
  );

  draft.pointer = {
    client: [position_client.x, position_client.y],
    position: canvas_space_pointer_position,
    last: draft.pointer.position,
  };

  if (draft.content_edit_mode?.type === "path") {
    const { a_point, node_id } = draft.content_edit_mode;
    const { tarnslate_with_axis_lock } = draft.gesture_modifiers;

    if (typeof a_point === "number" && tarnslate_with_axis_lock === "on") {
      const node = editor.dq.__getNodeById(
        draft,
        node_id
      ) as grida.program.nodes.PathNode;
      const { left: nx, top: ny } = node;
      const n_offset: cmath.Vector2 = [nx!, ny!];
      const { vertices } = node.vectorNetwork;
      const a = vertices[a_point];

      // mock the movement (movement = cursor pos - anchor pos)
      const movement = cmath.vector2.sub(
        draft.pointer.position,
        cmath.vector2.add(n_offset, a.p)
      );

      // movement relative to `a` point
      const adj_movement = cmath.ext.movement.axisLockedByDominance(movement);

      const adj_pos = cmath.vector2.add(
        a.p,
        cmath.ext.movement.normalize(adj_movement),
        n_offset
      );
      draft.content_edit_mode.path_cursor_position = adj_pos;
    } else {
      draft.content_edit_mode.path_cursor_position =
        canvas_space_pointer_position;
    }
  }
}

function __self_evt_on_pointer_move_raycast(
  draft: editor.state.IEditorState,
  action: EditorEventTarget_PointerMoveRaycast
) {
  const { node_ids_from_point } = <EditorEventTarget_PointerMoveRaycast>action;
  draft.hits = node_ids_from_point;
  self_updateSurfaceHoverState(draft);
}

function __self_evt_on_click(
  draft: editor.state.IEditorState,
  action: EditorEventTarget_Click
) {
  const { node_ids_from_point } = <EditorEventTarget_Click>action;
  draft.hits = node_ids_from_point;
  switch (draft.tool.type) {
    case "cursor":
    case "hand":
      // ignore
      break;
    case "zoom":
      // TODO: also support zoom out (with alt key modifier) - needs to be handled separately
      draft.transform = cmath.transform.scale(
        2,
        draft.transform,
        // map the cursor position back to surface space
        cmath.vector2.transform(draft.pointer.position, draft.transform)
      );
      break;
    case "insert":
      const parent = __get_insertion_target(draft);

      const nnode = initialNode(draft.tool.node);

      let relpos: cmath.Vector2;
      if (parent) {
        const cdom = new domapi.CanvasDOM(draft.transform);
        const parent_rect = cdom.getNodeBoundingRect(parent)!;
        const p: cmath.Vector2 = [parent_rect.x, parent_rect.y];
        relpos = cmath.vector2.sub(draft.pointer.position, p);
      } else {
        relpos = draft.pointer.position;
      }

      try {
        const _nnode = nnode as grida.program.nodes.UnknwonNode;

        // center translate the new node - so it can be positioned centered to the cursor point (width / 2, height / 2)
        const center_translate_delta: cmath.Vector2 =
          // (if width and height is fixed number) - can be 'auto' for text node
          typeof _nnode.width === "number" && typeof _nnode.height === "number"
            ? [_nnode.width / 2, _nnode.height / 2]
            : [0, 0];

        const nnode_relative_position = cmath.vector2.quantize(
          cmath.vector2.sub(relpos, center_translate_delta),
          1
        );

        _nnode.position = "absolute";
        _nnode.left! = nnode_relative_position[0];
        _nnode.top! = nnode_relative_position[1];
      } catch (e) {
        reportError(e);
      }

      self_try_insert_node(draft, parent, nnode);
      draft.tool = { type: "cursor" };
      self_selectNode(draft, "reset", nnode.id);

      // if the node is text, enter content edit mode
      if (nnode.type === "text") {
        draft.content_edit_mode = { type: "text", node_id: nnode.id };
      }
      break;
  }
}

function __self_evt_on_double_click(draft: editor.state.IEditorState) {
  // [double click event]
  // - DOES NOT "enter content edit mode" - this is handled by its own action.
  if (draft.gesture.type !== "idle") return; // ignore when gesture is active

  const {
    document_ctx,
    selection,
    hits: surface_raycast_detected_node_ids,
  } = draft;
  // #region [nested selection]
  // - focus on the next descendant (next deep) hit node (if any) relative to the selection

  // the selection is handled by the pointer down event, which is resolved before double click event.
  // if selection is not 1, means its clicked on void.
  // yet, do not assert, since 0 or 1+ is valid state when shift key is pressed. (althouth not handled by double click)
  if (selection.length !== 1) return;
  //

  const current_node_id = selection[0];
  // validate the state - the detected nodes shall include the selection
  if (!surface_raycast_detected_node_ids.includes(current_node_id)) {
    // invalid state - this can happen when double click is triggered on void space, when marquee ends
    return;
  }

  // find the next descendant node (deepest first) relative to the selection
  const next = getRayTarget(
    surface_raycast_detected_node_ids,
    {
      context: draft,
      config: draft.pointer_hit_testing_config,
    },
    true
  );

  // Update the selection if a valid next focus is found
  if (next) {
    self_selectNode(draft, "reset", next);
  }
  // #endregion
  //
}

function __self_evt_on_pointer_down(
  draft: editor.state.IEditorState,
  action: EditorEventTarget_PointerDown
) {
  const { node_ids_from_point, shiftKey } = <EditorEventTarget_PointerDown>(
    action
  );
  draft.hits = node_ids_from_point;

  switch (draft.tool.type) {
    case "cursor": {
      const { hovered_node_id } = self_updateSurfaceHoverState(draft);
      // ignore if in content edit mode
      if (draft.content_edit_mode) break;

      if (shiftKey) {
        if (hovered_node_id) {
          self_selectNode(draft, "toggle", hovered_node_id);
        } else {
          // do nothing (when shift key is pressed)
        }
      } else {
        if (hovered_node_id) {
          self_selectNode(draft, "reset", hovered_node_id);
        } else {
          self_clearSelection(draft);
        }
      }

      break;
    }
    case "insert":
      // ignore - insert mode will be handled via click or drag
      break;
    case "path": {
      if (draft.content_edit_mode?.type === "path") {
        const { hovered_vertex_idx: hovered_point } = draft;
        const { node_id, path_cursor_position, a_point, next_ta } =
          draft.content_edit_mode;

        const node = editor.dq.__getNodeById(
          draft,
          node_id
        ) as grida.program.nodes.PathNode;

        const vne = new vn.VectorNetworkEditor(node.vectorNetwork);

        const position =
          typeof hovered_point === "number"
            ? node.vectorNetwork.vertices[hovered_point].p
            : // relative position
              cmath.vector2.sub(path_cursor_position, [node.left!, node.top!]);

        const new_vertex_idx = vne.addVertex(
          position,
          a_point,
          next_ta ?? undefined
        );

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

        node.vectorNetwork = vne.value;

        draft.content_edit_mode.selected_vertices = [new_vertex_idx];
        draft.content_edit_mode.a_point = new_vertex_idx;

        // ...
      } else {
        // create a new node
        const new_node_id = nid();

        const vector = {
          type: "path",
          name: "path",
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
          zIndex: 0,
          stroke: { type: "solid", color: black },
          strokeCap: "butt",
          strokeWidth: 1,
          vectorNetwork: {
            vertices: [{ p: cmath.vector2.zero }],
            segments: [],
          },
        } satisfies grida.program.nodes.PathNode;

        const pos = draft.pointer.position;

        vector.left = pos[0];
        vector.top = pos[1];

        const parent = __get_insertion_target(draft);
        self_try_insert_node(draft, parent, vector);
        self_selectNode(draft, "reset", vector.id);

        draft.content_edit_mode = {
          type: "path",
          node_id: new_node_id,
          selected_vertices: [0], // select the first point
          a_point: 0,
          next_ta: null,
          path_cursor_position: pos,
        };
      }

      //
      break;
    }
    case "eraser":
    case "brush": {
      __self_brush(draft, { is_gesture: false });
      break;
    }
    case "flood-fill": {
      assert(draft.content_edit_mode?.type === "bitmap");
      __self_floodfill(draft, draft.content_edit_mode.imageRef);
      break;
    }
  }
}

function __self_evt_on_pointer_up(draft: editor.state.IEditorState) {
  draft.gesture = { type: "idle" };
}

function __self_evt_on_drag_start(
  draft: editor.state.IEditorState,
  action: EditorEventTarget_DragStart
) {
  const { shiftKey } = <EditorEventTarget_DragStart>action;

  draft.dragging = true;

  // if there is already a gesture, ignore
  if (draft.gesture.type !== "idle") return;

  // clear all trasform state
  draft.marquee = undefined;
  draft.dropzone = undefined;
  draft.surface_snapping = undefined;

  switch (draft.tool.type) {
    case "cursor": {
      // TODO: improve logic
      if (shiftKey) {
        if (draft.hovered_node_id) {
          __self_start_gesture_translate(draft);
        } else {
          // marquee selection
          draft.marquee = {
            a: draft.pointer.position,
            b: draft.pointer.position,
          };
        }
      } else {
        if (draft.selection.length === 0) {
          // marquee selection
          draft.marquee = {
            a: draft.pointer.position,
            b: draft.pointer.position,
          };
        } else {
          __self_start_gesture_translate(draft);
        }
      }
      break;
    }
    case "zoom": {
      // marquee zoom
      draft.marquee = {
        a: draft.pointer.position,
        b: draft.pointer.position,
      };
      break;
    }
    case "hand": {
      draft.gesture = {
        type: "pan",
        movement: cmath.vector2.zero,
        first: cmath.vector2.zero,
        last: cmath.vector2.zero,
      };
      break;
    }
    case "insert": {
      const parent = __get_insertion_target(draft);

      const initial_rect = {
        x: draft.pointer.position[0],
        y: draft.pointer.position[1],
        width: 1,
        height: 1,
      };
      //
      const nnode = initialNode(draft.tool.node, {
        left: initial_rect.x,
        top: initial_rect.y,
        width: initial_rect.width,
        height: initial_rect.height as 0, // casting for line node
      });

      self_try_insert_node(draft, parent, nnode);
      draft.tool = { type: "cursor" };
      self_selectNode(draft, "reset", nnode.id);
      __self_start_gesture_scale_draw_new_node(draft, {
        new_node_id: nnode.id,
        new_node_rect: initial_rect,
      });

      break;
    }
    case "draw": {
      const tool = draft.tool.tool;

      let vector: grida.program.nodes.PathNode | grida.program.nodes.LineNode;

      const new_node_id = nid();
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
        zIndex: 0,
        stroke: { type: "solid", color: black },
        strokeCap: "butt",
      } as const;

      switch (tool) {
        case "pencil": {
          vector = {
            ...__base,
            type: "path",
            name: "path",
            strokeWidth: 3,
            vectorNetwork: vn.polyline([cmath.vector2.zero]),
          } satisfies grida.program.nodes.PathNode;
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
            type: "path",
            name: "line",
            strokeWidth: 1,
            vectorNetwork: vn.polyline([cmath.vector2.zero]),
          } satisfies grida.program.nodes.PathNode;
          break;
        }
      }

      // insert a new vector node
      const parent = __get_insertion_target(draft);
      self_try_insert_node(draft, parent, vector);

      const cdom = new domapi.CanvasDOM(draft.transform);

      // position relative to the parent
      let node_relative_pos = draft.pointer.position;
      if (parent) {
        const parent_rect = cdom.getNodeBoundingRect(parent)!;
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
      break;
    }
    case "path": {
      // [path tool, drag start]
      assert(draft.content_edit_mode?.type === "path");
      const { node_id, selected_vertices } = draft.content_edit_mode;
      assert(selected_vertices.length === 1);
      const vertex = selected_vertices[0];

      const node = editor.dq.__getNodeById(
        draft,
        node_id
      ) as grida.program.nodes.PathNode;

      const vne = new vn.VectorNetworkEditor(node.vectorNetwork);
      const segments = vne.findSegments(vertex);

      if (segments.length === 0) {
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
      } else if (segments.length === 1) {
        const segment_idx = segments[0];

        const gesture = getInitialCurveGesture(draft, {
          node_id,
          segment: segment_idx,
          control: "tb",
          invert: true,
        });

        draft.gesture = gesture;
      } else {
        reportError(
          "invalid vector network path editing state. multiple segments found"
        );
      }

      break;
    }
    case "eraser":
    case "brush": {
      __self_brush(draft, { is_gesture: true });
      break;
    }
  }
}

function __self_evt_on_drag_end(
  draft: editor.state.IEditorState,
  action: EditorEventTarget_DragEnd
) {
  const { node_ids_from_area, shiftKey } = <EditorEventTarget_DragEnd>action;
  draft.dragging = false;

  switch (draft.tool.type) {
    case "draw":
      // keep if pencil mode
      if (draft.tool.tool === "pencil") break;
    case "brush":
    case "eraser":
    case "flood-fill":
      // keep for paint mode
      break;
    case "path":
    case "hand":
      // keep
      break;
    case "zoom": {
      if (draft.marquee) {
        // update zoom
        const _viewport_rect = domapi.get_viewport_rect();
        const vrect = {
          x: 0,
          y: 0,
          width: _viewport_rect.width,
          height: _viewport_rect.height,
        };
        const mrect = cmath.rect.fromPoints([draft.marquee.a, draft.marquee.b]);
        const t = cmath.ext.viewport.transformToFit(vrect, mrect);
        draft.transform = t;
      }

      // cancel to default
      draft.tool = { type: "cursor" };
      break;
    }
    case "cursor": {
      if (node_ids_from_area) {
        const target_node_ids = getMarqueeSelection(draft, node_ids_from_area);

        self_selectNode(
          draft,
          shiftKey ? "toggle" : "reset",
          ...target_node_ids
        );
      }

      // cancel to default
      draft.tool = { type: "cursor" };
      break;
    }
    case "insert":
    default:
      // cancel to default
      draft.tool = { type: "cursor" };
      break;
  }

  __self_maybe_end_gesture(draft);
  draft.gesture = { type: "idle" };
  draft.marquee = undefined;
}

function __self_evt_on_drag(
  draft: editor.state.IEditorState,
  action: EditorEventTarget_Drag
) {
  const scene = draft.document.scenes[draft.scene_id!];
  const {
    event: { movement, delta },
  } = <EditorEventTarget_Drag>action;

  if (draft.marquee) {
    draft.marquee!.b = draft.pointer.position;
  } else {
    if (draft.gesture.type === "idle") return;
    if (draft.gesture.type === "nudge") return;

    draft.gesture.last = draft.gesture.movement;
    draft.gesture.movement = movement;

    switch (draft.gesture.type) {
      case "pan": {
        // for panning, exceptionaly use the unscaled delta.
        const original_delta = cmath.vector2.multiply(
          action.event.delta,
          cmath.transform.getScale(draft.transform)
        );
        // move the viewport by delta
        draft.transform = cmath.transform.translate(
          draft.transform,
          original_delta
        );
        break;
      }
      case "guide": {
        const { axis, idx: index, initial_offset } = draft.gesture;

        const counter = axis === "x" ? 0 : 1;
        const m = movement[counter];

        const cdom = new domapi.CanvasDOM(draft.transform);

        // [snap the guide offset]
        // 1. to pixel grid (quantize 1)
        // 2. to objects geometry
        const { translated } = snapGuideTranslation(
          axis,
          initial_offset,
          scene.children.map((id) => cdom.getNodeBoundingRect(id)!),
          m,
          threshold(
            editor.config.DEFAULT_SNAP_MOVEMNT_THRESHOLD_FACTOR,
            draft.transform
          )
        );

        const offset = cmath.quantize(translated, 1);

        draft.gesture.offset = offset;
        draft.document.scenes[draft.scene_id!].guides[index].offset = offset;
        break;
      }
      // [insertion mode - resize after insertion]
      case "scale": {
        self_update_gesture_transform(draft);
        break;
      }
      // this is to handle "immediately drag move node"
      case "translate": {
        self_update_gesture_transform(draft);
        break;
      }
      case "sort": {
        self_update_gesture_transform(draft);
        break;
      }
      case "rotate": {
        self_update_gesture_transform(draft);
        break;
      }
      case "draw": {
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

        const node = editor.dq.__getNodeById(
          draft,
          node_id
        ) as grida.program.nodes.PathNode;

        const vne = new vn.VectorNetworkEditor({
          vertices: points.map((p) => ({ p })),
          segments: node.vectorNetwork.segments,
        });

        switch (mode) {
          case "line":
            vne.extendLine(point);
            break;
          case "pencil":
            vne.extendPolyline(point);
            break;
        }

        draft.gesture.points = vne.value.vertices.map((v) => v.p);

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
        node.vectorNetwork = vne.value;

        break;
      }

      case "brush": {
        __self_brush(draft, { is_gesture: true });
        break;
      }
      case "curve": {
        assert(draft.content_edit_mode?.type === "path");
        const { node_id, segment, initial, control, invert } = draft.gesture;

        const node = editor.dq.__getNodeById(
          draft,
          node_id
        ) as grida.program.nodes.PathNode;

        const { vectorNetwork } = node;
        const vne = new vn.VectorNetworkEditor(vectorNetwork);

        const tangentPos = cmath.vector2.add(
          initial,
          invert ? cmath.vector2.invert(movement) : movement
        );

        vne.updateTangent(segment, control, tangentPos, true);

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

        node.vectorNetwork = vne.value;
        break;
        //
      }
      case "curve-a": {
        assert(draft.content_edit_mode?.type === "path");
        const { node_id, vertex, initial, control, invert } = draft.gesture;

        const tangentPos = cmath.vector2.add(
          initial,
          invert ? cmath.vector2.invert(movement) : movement
        );

        draft.content_edit_mode.next_ta = tangentPos;

        break;
      }
      case "translate-vertex": {
        assert(draft.content_edit_mode?.type === "path");
        const { content_edit_mode } = draft;
        const { node_id } = content_edit_mode;
        const node = editor.dq.__getNodeById(
          draft,
          node_id
        ) as grida.program.nodes.PathNode;

        const { movement: _movement } = draft.gesture;

        assert(draft.gesture.type === "translate-vertex");
        const { tarnslate_with_axis_lock } = draft.gesture_modifiers;
        // axis lock movement with dominant axis
        const adj_movement =
          tarnslate_with_axis_lock === "on"
            ? cmath.ext.movement.axisLockedByDominance(_movement)
            : _movement;

        const { initial_verticies, initial_position } = draft.gesture;

        const vne = new vn.VectorNetworkEditor({
          vertices: initial_verticies.map((p) => ({ p })),
          segments: node.vectorNetwork.segments,
        });

        const bb_a = vne.getBBox();

        for (const i of content_edit_mode.selected_vertices) {
          vne.translateVertex(i, cmath.ext.movement.normalize(adj_movement));
        }

        const bb_b = vne.getBBox();

        const delta = cmath.vector2.sub([bb_b.x, bb_b.y], [bb_a.x, bb_a.y]);

        vne.translate(cmath.vector2.invert(delta));

        // position & dimension
        const new_pos = cmath.vector2.add(initial_position, delta);
        node.left = new_pos[0];
        node.top = new_pos[1];
        node.width = bb_b.width;
        node.height = bb_b.height;

        // update the node's vector network
        node.vectorNetwork = vne.value;

        break;
      }
      case "corner-radius": {
        const { node_id } = draft.gesture;
        const [dx, dy] = delta;
        const d = -Math.round(dx);
        const node = editor.dq.__getNodeById(draft, node_id);

        if (!("cornerRadius" in node)) {
          return;
        }

        // TODO: get accurate fixed width
        // TODO: also handle by height
        const fixed_width =
          typeof node.width === "number" ? node.width : undefined;
        const maxRaius = fixed_width ? fixed_width / 2 : undefined;

        const nextRadius =
          (typeof node.cornerRadius == "number" ? node.cornerRadius : 0) + d;

        const nextRadiusClamped = Math.floor(
          Math.min(maxRaius ?? Infinity, Math.max(0, nextRadius))
        );
        draft.document.nodes[node_id] = nodeReducer(node, {
          type: "node/change/cornerRadius",
          // TODO: resolve by anchor
          cornerRadius: nextRadiusClamped,
          node_id,
        });

        break;
        //
      }
      case "gap": {
        const { layout, axis, initial_gap, min_gap } = draft.gesture;
        const delta = movement[axis === "x" ? 0 : 1];
        const side: "left" | "top" = axis === "x" ? "left" : "top";

        switch (layout.type) {
          case "group": {
            const sorted = layout.objects
              .slice()
              .sort((a, b) => a[axis] - b[axis]);

            const gap = cmath.quantize(
              Math.max(initial_gap + delta, min_gap),
              1
            );

            // start from the first sorted object's position.
            let currentPos = sorted[0][axis];

            // Calculate new positions considering each rect's dimension.
            const transformed = sorted.map((obj) => {
              const next = { ...obj };
              next[axis] = cmath.quantize(currentPos, 1);
              currentPos += cmath.rect.getAxisDimension(next, axis) + gap;
              return next;
            });

            // Update layout objects with new positions.
            draft.gesture.layout.objects = transformed;
            draft.gesture.gap = gap;

            // Apply transform to the actual nodes.
            transformed.forEach((obj) => {
              const node = editor.dq.__getNodeById(
                draft,
                obj.id
              ) as grida.program.nodes.i.IPositioning;

              node[side] = obj[axis];
            });
            break;
          }

          case "flex": {
            const gap = cmath.quantize(
              Math.max(initial_gap + delta, min_gap),
              1
            );

            const container = editor.dq.__getNodeById(draft, layout.group);
            draft.document.nodes[layout.group] = nodeReducer(container, {
              type: "node/change/gap",
              gap: gap,
              node_id: container.id,
            });

            draft.gesture.gap = gap;
            break;
          }
        }

        break;
      }
    }
  }
}

function __self_evt_on_multiple_selection_overlay_click(
  draft: editor.state.IEditorState,
  action: EditorEventTarget_MultipleSelectionLayer_Click
) {
  const { selection, node_ids_from_point, shiftKey } = action;
  if (draft.gesture.type === "translate") return;
  draft.hits = node_ids_from_point;
  const { hovered_node_id } = self_updateSurfaceHoverState(draft);
  if (shiftKey) {
    if (hovered_node_id) {
      self_selectNode(draft, "toggle", hovered_node_id);
    }
  } else {
    if (hovered_node_id) {
      self_selectNode(draft, "reset", hovered_node_id);
    } else {
      self_clearSelection(draft);
    }
  }
}

function __self_prepare_bitmap_node(
  draft: Draft<editor.state.IEditorState>,
  node_id: string | null
): Draft<grida.program.nodes.BitmapNode> {
  if (!node_id) {
    const new_node_id = nid();
    const new_bitmap_ref_id = nid(); // TODO: use other id generator

    const cdom = new domapi.CanvasDOM(draft.transform);
    const parent = __get_insertion_target(draft);
    if (!parent) throw new Error("document level insertion not supported"); // FIXME: support document level insertion
    const parent_rect = cdom.getNodeBoundingRect(parent)!;
    const node_relative_pos = cmath.vector2.quantize(
      cmath.vector2.sub(draft.pointer.position, [parent_rect.x, parent_rect.y]),
      1
    );

    const width = 0;
    const height = 0;
    const x = node_relative_pos[0];
    const y = node_relative_pos[1];

    const bitmap: grida.program.nodes.BitmapNode = {
      type: "bitmap",
      name: "bitmap",
      id: new_node_id,
      active: true,
      locked: false,
      position: "absolute",
      opacity: 1,
      rotation: 0,
      zIndex: 0,
      left: x,
      top: y,
      width: width,
      height: height,
      imageRef: new_bitmap_ref_id,
    };

    draft.document.bitmaps[new_bitmap_ref_id] = {
      data: new Uint8ClampedArray(0),
      width: 0,
      height: 0,
      version: 0,
    };

    self_try_insert_node(draft, parent, bitmap);

    const node = editor.dq.__getNodeById(
      draft,
      new_node_id
    ) as grida.program.nodes.BitmapNode;

    self_clearSelection(draft);

    return node;
  } else {
    return editor.dq.__getNodeById(
      draft,
      node_id
    ) as grida.program.nodes.BitmapNode;
  }
}

function __self_brush(
  draft: Draft<editor.state.IEditorState>,
  {
    is_gesture,
  }: {
    is_gesture: boolean;
  }
) {
  assert(draft.tool.type === "brush" || draft.tool.type === "eraser");

  let node_id =
    draft.content_edit_mode?.type === "bitmap"
      ? draft.content_edit_mode.node_id
      : null;

  let color: cmath.Vector4;
  if (draft.gesture && draft.gesture.type == "brush") {
    color = draft.gesture.color;
  } else {
    color = get_next_brush_pain_color(draft, draft.user_clipboard_color);
  }

  const blendmode =
    draft.tool.type === "brush" ? "source-over" : "destination-out";
  const brush = draft.brush;

  const node = __self_prepare_bitmap_node(draft, node_id);

  const nodepos: cmath.Vector2 = [node.left!, node.top!];

  const image = draft.document.bitmaps[node.imageRef];

  // set up the editor from global.
  let bme: BitmapLayerEditor;
  if (
    editor.__global_editors.bitmap &&
    editor.__global_editors.bitmap.id === node.imageRef
  ) {
    bme = editor.__global_editors.bitmap;
  } else {
    bme = new BitmapLayerEditor(
      node.imageRef,
      {
        x: nodepos[0],
        y: nodepos[1],
        width: node.width,
        height: node.height,
      },
      image.data,
      image.version
    );
    editor.__global_editors.bitmap = bme;
  }
  bme.open();

  const pos: cmath.Vector2 = [...draft.pointer.position];

  // brush
  bme.brush(
    // relpos,
    pos,
    { color, ...brush },
    blendmode,
    blendmode === "source-over" ? "auto" : "clip"
  );

  // update image
  draft.document.bitmaps[node.imageRef] = {
    data: bme.data,
    version: bme.frame,
    width: bme.width,
    height: bme.height,
  };

  // transform node
  node.left = bme.x;
  node.top = bme.y;
  node.width = bme.width;
  node.height = bme.height;

  if (is_gesture) {
    if (draft.gesture.type === "idle") {
      draft.gesture = {
        type: "brush",
        movement: cmath.vector2.zero,
        first: cmath.vector2.zero,
        last: cmath.vector2.zero,
        color: color,
        node_id: node.id,
      };
    }
  } else {
    bme.close();
  }

  draft.content_edit_mode = {
    type: "bitmap",
    node_id: node.id,
    imageRef: node.imageRef,
  };

  return bme;
}

function __self_floodfill(
  draft: Draft<editor.state.IEditorState>,
  imageRef: string
) {
  const color = get_next_brush_pain_color(draft, draft.user_clipboard_color);
  const bme = editor.__global_editors.bitmap!;
  bme.floodfill(draft.pointer.position, color);
  draft.document.bitmaps[imageRef] = {
    data: bme.data,
    version: bme.frame,
    width: bme.width,
    height: bme.height,
  };
}

function get_next_brush_pain_color(
  state: editor.state.IEditorFeatureBrushState,
  fallback?: cg.RGBA8888
): cmath.Vector4 {
  return cmath.color.rgba_to_unit8_chunk(
    state.brush_color ?? fallback ?? black
  );
}

function __self_start_gesture_scale_draw_new_node(
  draft: Draft<editor.state.IEditorState>,
  {
    new_node_id,
    new_node_rect,
  }: {
    new_node_id: string;
    new_node_rect: cmath.Rectangle;
  }
) {
  draft.gesture = {
    type: "scale",
    initial_snapshot: editor.state.snapshot(draft),
    initial_rects: [new_node_rect],
    movement: cmath.vector2.zero,
    first: cmath.vector2.zero,
    last: cmath.vector2.zero,
    selection: [new_node_id],
    direction: "se",
  };
}

function __self_start_gesture_translate(
  draft: Draft<editor.state.IEditorState>
) {
  const selection = draft.selection;
  if (selection.length === 0) return;

  const cdom = new domapi.CanvasDOM(draft.transform);

  const rects = draft.selection.map(
    (node_id) => cdom.getNodeBoundingRect(node_id)!
  );

  draft.gesture = {
    type: "translate",
    selection: selection,
    initial_clone_ids: selection.map(() => nid()),
    initial_selection: selection,
    initial_rects: rects,
    initial_snapshot: editor.state.snapshot(draft),
    movement: cmath.vector2.zero,
    first: cmath.vector2.zero,
    last: cmath.vector2.zero,
    is_currently_cloned: false,
  };
}

function __self_maybe_end_gesture(draft: Draft<editor.state.IEditorState>) {
  switch (draft.gesture.type) {
    case "brush": {
      editor.__global_editors.bitmap?.close();
      break;
    }
    case "translate": {
      if (draft.gesture.is_currently_cloned) {
        // update the selection as the cloned nodes
        self_selectNode(draft, "reset", ...draft.gesture.selection);
      }
      draft.surface_measurement_targeting_locked = false;
      break;
    }
    case "sort": {
      const { placement } = draft.gesture;
      const node = draft.document.nodes[
        draft.gesture.node_id
      ] as grida.program.nodes.i.IPositioning;
      node.left = placement.rect.x;
      node.top = placement.rect.y;

      break;
    }
  }

  draft.gesture = { type: "idle" };
  draft.dropzone = undefined;
}

/**
 * get the parent of newly inserting node based on the current state
 *
 * this relies on `surface_raycast_detected_node_ids`, make sure it's updated before calling this function
 *
 * @returns the parent node id or `null` if no desired target
 */
function __get_insertion_target(
  state: editor.state.IEditorState
): string | null {
  assert(state.scene_id, "scene_id is not set");
  const scene = state.document.scenes[state.scene_id];
  if (scene.constraints.children === "single") {
    return scene.children[0];
  }

  const hits = state.hits.slice();
  for (const hit of hits) {
    const node = editor.dq.__getNodeById(state, hit);
    if (node.type === "container") return hit;
  }
  return null;
}

export default function eventTargetReducer<S extends editor.state.IEditorState>(
  state: S,
  action: EventTargetAction
): S {
  assert(state.scene_id, "scene_id is not set");

  // adjust the event by transform
  if ("event" in action) {
    const [scaleX, scaleY] = cmath.transform.getScale(state.transform);
    const factor: cmath.Vector2 = [1 / scaleX, 1 / scaleY];
    const original = { ...action.event };
    const adj = {
      ...original,
      // only delta and movement are scaled
      delta: cmath.vector2.multiply(action.event.delta, factor),
      movement: cmath.vector2.multiply(action.event.movement, factor),
    };

    // replace the action with adjusted event
    action = {
      ...action,
      event: adj,
    };
  }

  switch (action.type) {
    // #region [html backend] canvas event target
    case "event-target/event/on-pointer-move": {
      return produce(state, (draft) => {
        __self_evt_on_pointer_move(draft, action);
      });
    }
    case "event-target/event/on-pointer-move-raycast": {
      return produce(state, (draft) => {
        __self_evt_on_pointer_move_raycast(draft, action);
      });
    }
    case "event-target/event/on-click": {
      return produce(state, (draft) => {
        __self_evt_on_click(draft, action);
      });
    }
    case "event-target/event/on-double-click": {
      return produce(state, (draft) => {
        __self_evt_on_double_click(draft);
      });
    }
    case "event-target/event/on-pointer-down": {
      return produce(state, (draft) => {
        __self_evt_on_pointer_down(draft, action);
      });
    }
    case "event-target/event/on-pointer-up": {
      return produce(state, (draft) => {
        __self_evt_on_pointer_up(draft);
      });
    }
    // #region drag event
    case "event-target/event/on-drag-start": {
      return produce(state, (draft) => {
        __self_evt_on_drag_start(draft, action);
      });
    }
    case "event-target/event/on-drag-end": {
      return produce(state, (draft) => {
        __self_evt_on_drag_end(draft, action);
      });
    }
    case "event-target/event/on-drag": {
      return produce(state, (draft) => {
        __self_evt_on_drag(draft, action);
      });
    }
    //
    case "event-target/event/multiple-selection-overlay/on-click": {
      return produce(state, (draft) => {
        __self_evt_on_multiple_selection_overlay_click(draft, action);
      });
    }
    // #endregion drag event
    //

    // #endregion [html backend] canvas event target
  }
}
