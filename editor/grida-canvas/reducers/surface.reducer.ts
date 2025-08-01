import { produce, type Draft } from "immer";

import type { SurfaceAction, EditorSurface_StartGesture } from "../action";
import { editor } from "@/grida-canvas";
import { getInitialCurveGesture } from "./tools/gesture";
import assert from "assert";
import cmath from "@grida/cmath";
import grida from "@grida/schema";
import { dq } from "@/grida-canvas/query";
import {
  self_clearSelection,
  self_selectNode,
  encodeTranslateVectorCommand,
} from "./methods";
import type { BitmapEditorBrush } from "@grida/bitmap";
import type { ReducerContext } from ".";
import vn from "@grida/vn";

function createLayoutSnapshot(
  state: editor.state.IEditorState,
  group: string | null,
  items: string[],
  context: ReducerContext
): editor.gesture.LayoutSnapshot {
  let reldelta: cmath.Vector2 = [0, 0];
  let parent: grida.program.nodes.Node | null = null;
  if (group) {
    parent = dq.__getNodeById(state, group);
    const parent_rect = context.geometry.getNodeAbsoluteBoundingRect(group)!;
    reldelta = [-parent_rect.x, -parent_rect.y];
  }

  const objects: editor.gesture.LayoutSnapshot["objects"] = items.map(
    (node_id) => {
      const abs_rect = context.geometry.getNodeAbsoluteBoundingRect(node_id)!;
      const rel_rect = cmath.rect.translate(abs_rect, reldelta);

      return {
        ...rel_rect,
        id: node_id,
      };
    }
  );

  const is_group_flex_container =
    parent && parent.type === "container" && parent.layout === "flex";

  if (is_group_flex_container) {
    return {
      type: "flex",
      group: parent!.id,
      objects,
    };
  } else {
    return {
      type: "group",
      group,
      objects,
    };
  }
}

function __self_set_ruler(
  draft: editor.state.IEditorState,
  ruler: "on" | "off"
) {
  draft.ruler = ruler;
}

function __self_set_pixelgrid(
  draft: editor.state.IEditorState,
  pixelgrid: "on" | "off"
) {
  draft.pixelgrid = pixelgrid;
}

function __self_guide_delete(draft: editor.state.IEditorState, idx: number) {
  assert(draft.scene_id, "scene_id is not set");
  const scene = draft.document.scenes[draft.scene_id];
  scene.guides.splice(idx, 1);
}

function __self_try_content_edit_mode_fill_gradient(
  draft: editor.state.IEditorState,
  node_id: string
) {
  draft.content_edit_mode = {
    node_id: node_id,
    type: "fill/gradient",
    selected_stop: 0,
  };
}

function __self_try_enter_content_edit_mode_auto(
  draft: editor.state.IEditorState,
  node_id: string,
  context: ReducerContext
) {
  const node = dq.__getNodeById(draft, node_id);

  switch (node.type) {
    case "text": {
      // the text node should have a string literal value assigned (we don't support props editing via surface)
      if (typeof node.text !== "string") return;

      draft.content_edit_mode = {
        type: "text",
        node_id: node_id,
      };
      break;
    }
    // case "svgpath":
    case "vector": {
      draft.content_edit_mode = {
        type: "vector",
        node_id: node_id,
        selected_vertices: [],
        selected_segments: [],
        selected_tangents: [],
        a_point: null,
        next_ta: null,
        path_cursor_position: draft.pointer.position,
      };
      break;
    }
    // primitive shapes
    case "rectangle":
    case "star":
    case "polygon":
    case "ellipse":
    case "line": {
      // 1. convert the primitive to path

      const node = dq.__getNodeById(draft, node_id);
      const rect = context.geometry.getNodeAbsoluteBoundingRect(node_id)!;

      const v = toVectorNetwork(node, {
        width: rect.width,
        height: rect.height,
      });

      if (!v) return;

      const vne = new vn.VectorNetworkEditor(v);
      const bb_b = vne.getBBox();

      const delta: cmath.Vector2 = [bb_b.x, bb_b.y];
      vne.translate(cmath.vector2.invert(delta));

      // convert the shape to vector network
      const pathnode: grida.program.nodes.VectorNode = {
        ...(node as grida.program.nodes.UnknwonNode),
        type: "vector",
        id: node.id,
        active: node.active,
        cornerRadius: modeCornerRadius(node),
        fillRule:
          (node as grida.program.nodes.UnknwonNode).fillRule ?? "nonzero",
        vectorNetwork: vne.value,

        // re-map the transform (since star / polygon nodes size were not actual path bbox)
        width: bb_b.width,
        height: bb_b.height,
        left: node.left! + delta[0],
        top: node.top! + delta[1],
      } as grida.program.nodes.VectorNode;

      // replace the node with the path node
      // TODO: need a way to revert this operation if no changes are made.
      draft.document.nodes[node_id] = pathnode;

      // 2. enter path edit mode
      draft.content_edit_mode = {
        type: "vector",
        node_id: node_id,
        selected_vertices: [],
        selected_segments: [],
        selected_tangents: [],
        a_point: null,
        next_ta: null,
        path_cursor_position: draft.pointer.position,
      };

      break;
    }
    case "bitmap": {
      const node = dq.__getNodeById(
        draft,
        node_id
      ) as grida.program.nodes.BitmapNode;
      draft.content_edit_mode = {
        type: "bitmap",
        node_id: node.id,
        imageRef: node.imageRef,
      };
      draft.tool = {
        type: "brush",
      };
      self_clearSelection(draft);
      break;
    }
  }
}

/**
 * maps the rectangular corner radius or corner radius into singular corner radius
 * @param node
 */
function modeCornerRadius(node: grida.program.nodes.Node): number | undefined {
  if ("cornerRadius" in node) {
    return node.cornerRadius;
  }

  if ("cornerRadiusTopLeft" in node) {
    const values: number[] = [
      node.cornerRadiusTopLeft,
      node.cornerRadiusTopRight,
      node.cornerRadiusBottomLeft,
      node.cornerRadiusBottomRight,
    ].filter((it) => it !== undefined);

    return cmath.mode(values);
  }
}

function toVectorNetwork(
  node: grida.program.nodes.Node,
  size: { width: number; height: number }
): vn.VectorNetwork | null {
  switch (node.type) {
    case "rectangle": {
      return vn.fromRect({
        x: 0,
        y: 0,
        width: size.width,
        height: size.height,
      });
    }
    case "ellipse": {
      // TODO: check if ellipse is arc, if so, rely on wasm backend.
      return vn.fromEllipse({
        x: 0,
        y: 0,
        width: size.width,
        height: size.height,
      });
    }
    case "polygon": {
      return vn.fromRegularPolygon({
        x: 0,
        y: 0,
        width: size.width,
        height: size.height,
        points: node.pointCount ?? 3,
      });
    }
    case "star": {
      return vn.fromRegularStarPolygon({
        x: 0,
        y: 0,
        width: size.width,
        height: size.height,
        points: node.pointCount ?? 5,
        innerRadius: node.innerRadius ?? 0.5,
      });
    }
    default: {
      return null;
    }
  }
  //
}

function __self_try_exit_content_edit_mode(draft: editor.state.IEditorState) {
  draft.content_edit_mode = undefined;
  draft.tool = { type: "cursor" };
}

function __self_set_tool(
  draft: editor.state.IEditorState,
  tool: editor.state.ToolMode
) {
  if (
    draft.flags.__unstable_brush_tool !== "on" &&
    (tool.type === "brush" || tool.type === "eraser")
  ) {
    console.warn("unstable brush tool is not enabled");
    return;
  }

  const vector_edit_mode_valid_tool_modes: editor.state.ToolModeType[] = [
    "cursor",
    "hand",
    "path",
    "lasso",
  ];
  const text_edit_mode_valid_tool_modes: editor.state.ToolModeType[] = [
    "cursor",
  ];
  const bitmap_edit_mode_valid_tool_modes: editor.state.ToolModeType[] = [
    "brush",
    "eraser",
    "flood-fill",
  ];

  // validate cursor mode
  if (draft.content_edit_mode) {
    switch (draft.content_edit_mode.type) {
      case "vector":
        if (!vector_edit_mode_valid_tool_modes.includes(tool.type)) return;
        break;
      case "text":
        if (!text_edit_mode_valid_tool_modes.includes(tool.type)) return;
        break;
      case "bitmap":
        if (!bitmap_edit_mode_valid_tool_modes.includes(tool.type)) {
          draft.content_edit_mode = undefined;
        }
        break;
    }
  }

  draft.tool = tool;
}

function __self_set_brush(
  draft: editor.state.IEditorState,
  brush: BitmapEditorBrush
) {
  if (draft.tool.type === "brush" || draft.tool.type === "eraser") {
    draft.brush = { opacity: 1, ...brush };
  }
}

function __self_set_brush_size(
  draft: editor.state.IEditorState,
  size: editor.api.NumberChange
) {
  if (!(draft.tool.type === "brush" || draft.tool.type === "eraser")) return;
  switch (size.type) {
    case "set":
      draft.brush.size = [size.value, size.value];
      break;
    case "delta":
      draft.brush.size = cmath.vector2.add(draft.brush.size, [
        size.value,
        size.value,
      ]);
      break;
  }
  draft.brush.size = cmath.vector2.max([1, 1], draft.brush.size);
}

function __self_set_brush_opacity(
  draft: editor.state.IEditorState,
  opacity: editor.api.NumberChange
) {
  if (draft.tool.type !== "brush") return;
  switch (opacity.type) {
    case "set":
      draft.brush.opacity = opacity.value;
      break;
    case "delta":
      draft.brush.opacity += opacity.value;
      break;
  }
  draft.brush.opacity = cmath.clamp(draft.brush.opacity, 0, 1);
}

function __self_start_gesture(
  draft: editor.state.IEditorState,
  gesture: EditorSurface_StartGesture["gesture"],
  context: ReducerContext
) {
  draft.surface_snapping = undefined;

  switch (gesture.type) {
    case "guide": {
      const { axis, idx } = gesture;

      assert(draft.scene_id, "scene_id is not set");
      const scene = draft.document.scenes[draft.scene_id];

      if (idx === -1) {
        const t = cmath.transform.getTranslate(draft.transform);
        const s = cmath.transform.getScale(draft.transform);

        const axi = axis === "x" ? 0 : 1;

        const next = {
          axis,
          offset: -cmath.quantize(t[axi] * (1 / s[axi]), 1),
        } satisfies grida.program.document.Guide2D;
        const idx = scene.guides.push(next) - 1;

        // new
        draft.gesture = {
          type: "guide",
          axis,
          idx: idx,
          offset: next.offset,
          initial_offset: next.offset,
          movement: cmath.vector2.zero,
          first: cmath.vector2.zero,
          last: cmath.vector2.zero,
        };
      } else {
        // existing
        const guide = scene.guides[idx];
        assert(guide.axis === axis, "guide gesture axis mismatch");
        draft.gesture = {
          type: "guide",
          axis,
          idx: idx,
          offset: guide.offset,
          initial_offset: guide.offset,
          movement: cmath.vector2.zero,
          first: cmath.vector2.zero,
          last: cmath.vector2.zero,
        };
      }

      break;
    }
    case "curve": {
      const { node_id, segment, control } = gesture;

      assert(draft.content_edit_mode?.type === "vector");
      assert(draft.content_edit_mode?.node_id === node_id);

      draft.gesture = getInitialCurveGesture(draft, {
        node_id,
        segment,
        control,
        invert: false,
      });
      break;
    }
    case "scale": {
      const { selection, direction } = gesture;
      //

      draft.content_edit_mode = undefined;
      draft.hovered_node_id = null;

      __self_start_gesture_scale(draft, {
        selection: selection,
        direction: direction,
        context,
      });
      //
      break;
    }
    case "corner-radius": {
      const { node_id } = gesture;

      self_selectNode(draft, "reset", node_id);
      draft.gesture = {
        type: "corner-radius",
        movement: cmath.vector2.zero,
        first: cmath.vector2.zero,
        last: cmath.vector2.zero,
        initial_bounding_rectangle:
          context.geometry.getNodeAbsoluteBoundingRect(node_id)!,
        node_id: node_id,
      };
      break;
    }
    case "rotate": {
      const { selection } = gesture;

      self_selectNode(draft, "reset", selection);
      __self_start_gesture_rotate(draft, {
        selection: selection,
        initial_bounding_rectangle:
          context.geometry.getNodeAbsoluteBoundingRect(selection)!,
        // TODO: the offset of rotation handle relative to the center of the rectangle
        offset: cmath.vector2.zero,
      });
      //
      break;
    }
    case "translate-vector-controls": {
      const { content_edit_mode } = draft;
      assert(content_edit_mode && content_edit_mode.type === "vector");
      const { node_id } = content_edit_mode;
      const node = dq.__getNodeById(
        draft,
        node_id
      ) as grida.program.nodes.VectorNode;

      const verticies = node.vectorNetwork.vertices.map((v) => v.p);
      const segments = node.vectorNetwork.segments.map((s) => ({ ...s }));

      const { vertices, tangents } = encodeTranslateVectorCommand(
        node.vectorNetwork,
        {
          selected_vertices: content_edit_mode.selected_vertices,
          selected_segments: content_edit_mode.selected_segments,
          selected_tangents: content_edit_mode.selected_tangents,
        }
      );

      draft.gesture = {
        type: "translate-vector-controls",
        node_id: node_id,
        initial_verticies: verticies,
        initial_segments: segments,
        vertices,
        tangents,
        movement: cmath.vector2.zero,
        first: cmath.vector2.zero,
        last: cmath.vector2.zero,
        initial_position: [node.left!, node.top!],
      };
      break;
      //
    }
    case "sort": {
      const { selection, node_id } = gesture;

      // assure the selection shares the same parent
      const parent_id = dq.getParentId(draft.document_ctx, node_id);
      if (
        !selection.every(
          (it) => dq.getParentId(draft.document_ctx, it) === parent_id
        )
      ) {
        return;
      }

      const layout = createLayoutSnapshot(
        draft,
        parent_id!,
        selection,
        context
      );
      const initial_index = layout.objects.findIndex((it) => it.id === node_id);

      const initial_placement = {
        index: initial_index,
        rect: layout.objects[initial_index],
      };

      draft.gesture = {
        type: "sort",
        node_id: node_id,
        node_initial_rect: layout.objects[initial_index],
        layout: layout,
        placement: initial_placement,
        movement: cmath.vector2.zero,
        first: cmath.vector2.zero,
        last: cmath.vector2.zero,
      };

      draft.dropzone = {
        type: "rect",
        rect: initial_placement.rect,
      };
      break;
    }
    case "gap": {
      const { selection, axis } = gesture;

      // [gap gesture]
      // mode 1: gap (distribute) the group of selection
      // mode 2: update the gap the flex container (parent)

      if (Array.isArray(selection)) {
        // assure the selection shares the same parent
        const parent_id = dq.getParentId(draft.document_ctx, selection[0]);
        if (
          !selection.every(
            (it) => dq.getParentId(draft.document_ctx, it) === parent_id
          )
        ) {
          return;
        }

        const layout = createLayoutSnapshot(
          draft,
          parent_id,
          selection,
          context
        );
        layout.objects.sort((a, b) => a[axis] - b[axis]);

        const [gap] = cmath.rect.getUniformGap(
          layout.objects,
          axis,
          editor.config.DEFAULT_GAP_ALIGNMENT_TOLERANCE
        );

        assert(gap !== undefined, "gap is not uniform");

        // the negaive size of the smallet object or the first sorted object's size (+1)
        const min_gap =
          -Math.min(
            ...layout.objects.map((it) => cmath.rect.getAxisDimension(it, axis))
          ) + 1;

        draft.gesture = {
          type: "gap",
          axis,
          layout,
          min_gap: min_gap,
          initial_gap: gap,
          gap: gap,
          movement: cmath.vector2.zero,
          first: cmath.vector2.zero,
          last: cmath.vector2.zero,
        };
      } else {
        // assert the selection to be a flex container
        const node = dq.__getNodeById(draft, selection);
        assert(
          node.type === "container" && node.layout === "flex",
          "the selection is not a flex container"
        );
        // (we only support main axis gap for now) - ignoring the input axis.
        const { direction, mainAxisGap } = node;

        const children = dq.getChildren(draft.document_ctx, selection);

        const layout = createLayoutSnapshot(
          draft,
          selection,
          children,
          context
        );

        draft.gesture = {
          type: "gap",
          axis: direction === "horizontal" ? "x" : "y",
          layout,
          min_gap: 0,
          initial_gap: mainAxisGap,
          gap: mainAxisGap,
          movement: cmath.vector2.zero,
          first: cmath.vector2.zero,
          last: cmath.vector2.zero,
        };
        //
      }

      break;
    }
  }
}

function __self_start_gesture_scale(
  draft: Draft<editor.state.IEditorState>,
  {
    selection,
    direction,
    context,
  }: {
    selection: string[];
    direction: cmath.CardinalDirection;
    context: ReducerContext;
  }
) {
  if (selection.length === 0) return;
  const rects = selection.map(
    (node_id) => context.geometry.getNodeAbsoluteBoundingRect(node_id)!
  );

  draft.gesture = {
    type: "scale",
    initial_snapshot: editor.state.snapshot(draft),
    initial_rects: rects,
    movement: cmath.vector2.zero,
    first: cmath.vector2.zero,
    last: cmath.vector2.zero,
    selection: selection,
    direction: direction,
  };

  let i = 0;
  for (const node_id of selection) {
    const node = dq.__getNodeById(draft, node_id);
    const rect = rects[i++];

    // once the node's measurement mode is set to fixed (from drag start), we may safely cast the width / height sa fixed number
    // need to assign a fixed size if width or height is a variable length
    const _node = node as grida.program.nodes.i.ICSSDimension;

    // needs to set width
    if (
      direction === "e" ||
      direction === "w" ||
      direction === "ne" ||
      direction === "se" ||
      direction === "nw" ||
      direction === "sw"
    ) {
      if (typeof _node.width !== "number") {
        _node.width = cmath.quantize(rect.width, 1);
      }
    }

    // needs to set height
    if (
      direction === "n" ||
      direction === "s" ||
      direction === "ne" ||
      direction === "nw" ||
      direction === "se" ||
      direction === "sw"
    ) {
      if (typeof _node.height !== "number") {
        if (node.type === "line") {
          _node.height = 0;
        } else {
          _node.height = cmath.quantize(rect.height, 1);
        }
      }
    }
  }
}

function __self_start_gesture_rotate(
  draft: Draft<editor.state.IEditorState>,
  {
    selection,
    offset,
    initial_bounding_rectangle,
  }: {
    selection: string;
    initial_bounding_rectangle: cmath.Rectangle;
    offset: cmath.Vector2;
  }
) {
  const { rotation } = dq.__getNodeById(
    draft,
    selection
  ) as grida.program.nodes.i.IRotation;

  draft.gesture = {
    type: "rotate",
    initial_bounding_rectangle: initial_bounding_rectangle,
    offset: offset,
    selection: selection,
    rotation: rotation,
    movement: cmath.vector2.zero,
    first: cmath.vector2.zero,
    last: cmath.vector2.zero,
  };
}

export default function surfaceReducer<S extends editor.state.IEditorState>(
  state: S,
  action: SurfaceAction,
  context: ReducerContext
): S {
  return produce(state, (draft) => {
    switch (action.type) {
      case "surface/ruler": {
        const { state: rulerstate } = action;
        __self_set_ruler(draft, rulerstate);
        break;
      }
      case "surface/guide/delete": {
        const { idx } = action;
        __self_guide_delete(draft, idx);
        break;
      }
      case "surface/pixel-grid": {
        const { state: pixelgridstate } = action;
        __self_set_pixelgrid(draft, pixelgridstate);
        break;
      }
      case "surface/content-edit-mode/try-enter": {
        if (state.selection.length !== 1) break;
        const node_id = state.selection[0];
        __self_try_enter_content_edit_mode_auto(draft, node_id, context);
        break;
      }
      case "surface/content-edit-mode/fill/gradient": {
        const { node_id } = action;
        __self_try_content_edit_mode_fill_gradient(draft, node_id);
        break;
      }
      case "surface/content-edit-mode/try-exit": {
        __self_try_exit_content_edit_mode(draft);
        break;
      }
      case "surface/tool": {
        const { tool } = action;
        __self_set_tool(draft, tool);
        break;
      }
      case "surface/brush": {
        const { brush } = action;
        __self_set_brush(draft, brush);
        break;
      }
      case "surface/brush/size": {
        const { size } = action;
        __self_set_brush_size(draft, size);
        break;
      }
      case "surface/brush/opacity": {
        const { opacity } = action;
        __self_set_brush_opacity(draft, opacity);
        break;
      }
      case "surface/gesture/start": {
        const { gesture } = action;
        __self_start_gesture(draft, gesture, context);
        break;
      }
    }
  });
}
