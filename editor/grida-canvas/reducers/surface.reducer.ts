import { produce, type Draft } from "immer";

import type { SurfaceAction, EditorSurface_StartGesture } from "../action";
import { editor } from "@/grida-canvas";
import { getInitialCurveGesture } from "./tools/gesture";
import assert from "assert";
import cmath from "@grida/cmath";
import grida from "@grida/schema";
import { dq } from "@/grida-canvas/query";
import vn from "@grida/vn";
import {
  self_clearSelection,
  self_selectNode,
  encodeTranslateVectorCommand,
  self_flattenNode,
  self_optimizeVectorNetwork,
  self_try_remove_node,
  self_select_tool,
  self_revert_tool,
} from "./methods";
import type { BitmapEditorBrush } from "@grida/bitmap";
import type { ReducerContext } from ".";
import equal from "fast-deep-equal";

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

function __self_try_content_edit_mode_paint_gradient(
  draft: editor.state.IEditorState,
  node_id: string,
  paint_target: "fill" | "stroke" = "fill",
  paint_index: number = 0
) {
  draft.content_edit_mode = {
    node_id: node_id,
    type: "paint/gradient",
    paint_target,
    selected_stop: 0,
    paint_index,
  };
}

function __self_try_content_edit_mode_paint_image(
  draft: editor.state.IEditorState,
  node_id: string,
  paint_target: "fill" | "stroke" = "fill",
  paint_index: number = 0
) {
  draft.content_edit_mode = {
    node_id,
    type: "paint/image",
    paint_target,
    paint_index,
  };
}

export function __self_try_enter_content_edit_mode_vector(
  draft: editor.state.IEditorState,
  node_id: string,
  context: ReducerContext
) {
  const node = dq.__getNodeById(draft, node_id);
  const nodeSnapshot: grida.program.nodes.UnknwonNode = JSON.parse(
    JSON.stringify(node)
  );

  switch (node.type) {
    case "vector": {
      draft.content_edit_mode = {
        type: "vector",
        node_id: node_id,
        selection: {
          selected_vertices: [],
          selected_segments: [],
          selected_tangents: [],
        },
        a_point: null,
        next_ta: null,
        initial_vector_network: node.vectorNetwork,
        original: nodeSnapshot,
        selection_neighbouring_vertices: [],
        cursor: draft.pointer.position,
        clipboard: null,
        clipboard_node_position: null,
        hovered_control: null,
        snapped_vertex_idx: null,
        snapped_segment_p: null,
      };
      break;
    }
    // primitive shapes
    case "rectangle":
    case "star":
    case "polygon":
    case "ellipse":
    case "line": {
      const flattened = self_flattenNode(draft, node_id, context);
      if (!flattened) return;
      const { node: vectornode } = flattened;
      draft.content_edit_mode = {
        type: "vector",
        node_id: node_id,
        selection: {
          selected_vertices: [],
          selected_segments: [],
          selected_tangents: [],
        },
        a_point: null,
        next_ta: null,
        initial_vector_network: vectornode.vectorNetwork,
        original: nodeSnapshot,
        selection_neighbouring_vertices: [],
        cursor: draft.pointer.position,
        clipboard: null,
        clipboard_node_position: null,
        hovered_control: null,
        snapped_vertex_idx: null,
        snapped_segment_p: null,
      };

      break;
    }
  }
}

function __has_image_paint(node: grida.program.nodes.Node): {
  hasImage: boolean;
  paintTarget: "fill" | "stroke";
  paintIndex: number;
} | null {
  if (node.type === "text") return null;

  // Check fills
  const fills = Array.isArray((node as any).fills)
    ? ((node as any).fills as grida.program.nodes.i.props.PropsPaintValue[])
    : (node as any).fill
      ? [(node as any).fill as grida.program.nodes.i.props.PropsPaintValue]
      : [];
  const fillImageIndex = fills.findIndex((paint) => paint?.type === "image");

  if (fillImageIndex !== -1) {
    return { hasImage: true, paintTarget: "fill", paintIndex: fillImageIndex };
  }

  // Check strokes
  const strokes = Array.isArray((node as any).strokes)
    ? ((node as any).strokes as grida.program.nodes.i.props.PropsPaintValue[])
    : (node as any).stroke
      ? [(node as any).stroke as grida.program.nodes.i.props.PropsPaintValue]
      : [];
  const strokeImageIndex = strokes.findIndex(
    (paint) => paint?.type === "image"
  );

  if (strokeImageIndex !== -1) {
    return {
      hasImage: true,
      paintTarget: "stroke",
      paintIndex: strokeImageIndex,
    };
  }

  return null;
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
    case "vector":
    // primitive shapes
    case "rectangle":
    case "star":
    case "polygon":
    case "ellipse":
    case "line": {
      // Check for image paints first
      const imagePaintInfo = __has_image_paint(node);
      if (imagePaintInfo?.hasImage) {
        return __self_try_content_edit_mode_paint_image(
          draft,
          node_id,
          imagePaintInfo.paintTarget,
          imagePaintInfo.paintIndex
        );
      }

      return __self_try_enter_content_edit_mode_vector(draft, node_id, context);
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
      self_select_tool(
        draft,
        {
          type: "brush",
        },
        context
      );
      self_clearSelection(draft);
      break;
    }
  }
}

function __try_restore_vector_mode_original_node(
  draft: Draft<editor.state.IEditorState>,
  mode: editor.state.VectorContentEditMode
) {
  if (!mode.original) return;

  const current = dq.__getNodeById(
    draft,
    mode.node_id
  ) as grida.program.nodes.VectorNode;

  const dirty = !equal(mode.initial_vector_network, current.vectorNetwork);
  if (dirty) return;

  draft.document.nodes[mode.node_id] = {
    ...mode.original,
    // TODO: need to implement this by having the initial xy position and comparing that diff.
    // // while the vector data itself is not changed, the position of the node may have been changed. - keep that.
    // // this happens when translating the node, by dragging the region. - when even the data is translated, it's 0,0 relative, so the data itself may be identical.
    // left: current.left,
    // top: current.top,
  } as grida.program.nodes.Node;
  //
}

/**
 * For vector edit mode, if no edits were performed, the node is restored to the
 * original primitive node that existed before entering the mode.
 */
function __self_before_exit_content_edit_mode(
  draft: Draft<editor.state.IEditorState>
) {
  const mode = draft.content_edit_mode;

  switch (mode?.type) {
    case "vector": {
      // optimize the vector network before exiting the mode.
      self_optimizeVectorNetwork(draft);

      const current = dq.__getNodeById(
        draft,
        mode.node_id
      ) as grida.program.nodes.VectorNode;

      // auto remove the node when the vector network is effectively empty
      if (
        current.vectorNetwork.segments.length < 1 ||
        current.vectorNetwork.vertices.length < 2
      ) {
        self_try_remove_node(draft, mode.node_id);
        break;
      }

      // restore the original node if no changes were made.
      __try_restore_vector_mode_original_node(draft, mode);

      break;
    }
    case "text": {
      const current = dq.__getNodeById(
        draft,
        mode.node_id
      ) as grida.program.nodes.TextNode;
      // when text is empty, remove that. - (when perfectly empty)
      if (typeof current.text === "string" && current.text === "") {
        self_try_remove_node(draft, mode.node_id);
      }
      break;
    }
  }
}

/**
 * Attempts to exit the current content edit mode.
 */
function __self_try_exit_content_edit_mode(
  draft: Draft<editor.state.IEditorState>
) {
  __self_before_exit_content_edit_mode(draft);
  draft.content_edit_mode = undefined;
  self_revert_tool(draft);
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
      if (draft.content_edit_mode?.type === "vector") {
        self_optimizeVectorNetwork(draft);
      }
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
      const { node_id, anchor } = gesture;

      self_selectNode(draft, "reset", node_id);
      draft.gesture = {
        type: "corner-radius",
        movement: cmath.vector2.zero,
        first: cmath.vector2.zero,
        last: cmath.vector2.zero,
        initial_bounding_rectangle:
          context.geometry.getNodeAbsoluteBoundingRect(node_id)!,
        node_id: node_id,
        anchor,
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

      const verticies = node.vectorNetwork.vertices.map((v) => v);
      const segments = node.vectorNetwork.segments.map((s) => ({ ...s }));

      const { vertices, tangents } = encodeTranslateVectorCommand(
        node.vectorNetwork,
        {
          selected_vertices: content_edit_mode.selection.selected_vertices,
          selected_segments: content_edit_mode.selection.selected_segments,
          selected_tangents: content_edit_mode.selection.selected_tangents,
        }
      );

      const abs = context.geometry.getNodeAbsoluteBoundingRect(node_id)!;
      const absolute_position: cmath.Vector2 = [abs.x, abs.y];

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
        initial_absolute_position: absolute_position,
      };
      break;
      //
    }
    case "translate-variable-width-stop": {
      const { content_edit_mode } = draft;
      assert(content_edit_mode && content_edit_mode.type === "width");
      const { node_id, stop } = gesture;
      const node = dq.__getNodeById(
        draft,
        node_id
      ) as grida.program.nodes.VectorNode;

      const profile = content_edit_mode.variable_width_profile;
      const initial_stop = profile.stops[stop];

      const abs = context.geometry.getNodeAbsoluteBoundingRect(node_id)!;
      const absolute_position: cmath.Vector2 = [abs.x, abs.y];

      draft.gesture = {
        type: "translate-variable-width-stop",
        node_id: node_id,
        stop: stop,
        initial_stop: { ...initial_stop },
        movement: cmath.vector2.zero,
        first: cmath.vector2.zero,
        last: cmath.vector2.zero,
        initial_position: [node.left!, node.top!],
        initial_absolute_position: absolute_position,
      };
      break;
      //
    }
    case "resize-variable-width-stop": {
      const { content_edit_mode } = draft;
      assert(content_edit_mode && content_edit_mode.type === "width");
      const { node_id, stop, side } = gesture;
      const node = dq.__getNodeById(
        draft,
        node_id
      ) as grida.program.nodes.VectorNode;

      const profile = content_edit_mode.variable_width_profile;
      const initial_stop = profile.stops[stop];

      const abs = context.geometry.getNodeAbsoluteBoundingRect(node_id)!;
      const absolute_position: cmath.Vector2 = [abs.x, abs.y];

      // Calculate the initial angle from the curve at the curve position
      // This matches the calculation in SurfaceVariableWidthEditor
      const t_param = initial_stop.u;
      const segments = node.vectorNetwork.segments;
      const totalSegments = segments.length;
      const segmentIndex = Math.floor(t_param * totalSegments);
      const ct = (t_param * totalSegments) % 1;

      let initial_angle = 0;
      let curve_position: cmath.Vector2 = [0, 0];

      if (segmentIndex < totalSegments) {
        const segment = segments[segmentIndex];

        // Get absolute vertices (similar to useVariableWithEditor)
        const vne = new vn.VectorNetworkEditor(node.vectorNetwork);
        const absolute_vertices = vne.getVerticesAbsolute([
          node.left!,
          node.top!,
        ]);

        const a = absolute_vertices[segment.a];
        const b = absolute_vertices[segment.b];
        const ta = segment.ta;
        const tb = segment.tb;

        // Evaluate the curve position and tangent at the given parameter
        curve_position = cmath.bezier.evaluate(a, b, ta, tb, ct);
        const tangent = cmath.bezier.tangentAt(a, b, ta, tb, ct);
        initial_angle = Math.atan2(tangent[1], tangent[0]);
      }

      draft.gesture = {
        type: "resize-variable-width-stop",
        node_id: node_id,
        stop: stop,
        side: side,
        initial_stop: { ...initial_stop },
        movement: cmath.vector2.zero,
        first: cmath.vector2.zero,
        last: cmath.vector2.zero,
        initial_position: [node.left!, node.top!],
        initial_absolute_position: absolute_position,
        initial_angle: initial_angle,
        initial_curve_position: curve_position,
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
        // For text nodes, use ceil to ensure we don't cut off content
        if (node.type === "text") {
          _node.width = Math.ceil(rect.width);
        } else {
          _node.width = cmath.quantize(rect.width, 1);
        }
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
          // For text nodes, use ceil to ensure we don't cut off content
          if (node.type === "text") {
            _node.height = Math.ceil(rect.height);
          } else {
            _node.height = cmath.quantize(rect.height, 1);
          }
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
      case "surface/content-edit-mode/paint/gradient": {
        const { node_id, paint_target = "fill", paint_index = 0 } = action;
        __self_try_content_edit_mode_paint_gradient(
          draft,
          node_id,
          paint_target,
          paint_index ?? 0
        );
        break;
      }
      case "surface/content-edit-mode/paint/image": {
        const { node_id, paint_target = "fill", paint_index = 0 } = action;
        __self_try_content_edit_mode_paint_image(
          draft,
          node_id,
          paint_target,
          paint_index ?? 0
        );
        break;
      }
      case "surface/content-edit-mode/try-exit": {
        __self_try_exit_content_edit_mode(draft);
        break;
      }
      case "surface/tool": {
        const { tool } = action;
        self_select_tool(draft, tool, context);
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
