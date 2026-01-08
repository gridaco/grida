import { type Draft } from "immer";
import kolor from "@grida/color";
import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import grida from "@grida/schema";
import assert from "assert";
import { BitmapLayerEditor } from "@grida/bitmap";
import cmath from "@grida/cmath";
import cg from "@grida/cg";
import { self_try_insert_node, self_clearSelection } from "./methods";
import type { ReducerContext } from ".";

/**
 * Prepares a bitmap node for editing, creating a new one if needed
 */
export function prepare_bitmap_node(
  draft: Draft<editor.state.IEditorState>,
  node_id: string | null,
  context: ReducerContext
): Draft<grida.program.nodes.BitmapNode> {
  if (!node_id) {
    const new_node_id = context.idgen.next();
    const new_bitmap_ref_id = context.idgen.next(); // FIXME: use other id generator

    const parent = __get_insertion_target(draft);
    if (!parent) throw new Error("document level insertion not supported"); // FIXME: support document level insertion
    const parent_rect = context.geometry.getNodeAbsoluteBoundingRect(parent)!;
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
      z_index: 0,
      left: x,
      top: y,
      layout_target_width: width,
      layout_target_height: height,
      imageRef: new_bitmap_ref_id,
    };

    draft.document.bitmaps[new_bitmap_ref_id] = {
      data: new Uint8ClampedArray(0),
      width: 0,
      height: 0,
      version: 0,
    };

    self_try_insert_node(draft, parent, bitmap);

    const node = dq.__getNodeById(
      draft,
      new_node_id
    ) as grida.program.nodes.BitmapNode;

    self_clearSelection(draft);

    return node;
  } else {
    return dq.__getNodeById(draft, node_id) as grida.program.nodes.BitmapNode;
  }
}

/**
 * Handles brush tool pointer down and drag events
 */
export function on_brush(
  draft: Draft<editor.state.IEditorState>,
  {
    is_gesture,
  }: {
    is_gesture: boolean;
  },
  context: ReducerContext
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

  const node = prepare_bitmap_node(draft, node_id, context);

  const nodepos: cmath.Vector2 = [node.left!, node.top!];

  const image = draft.document.bitmaps[node.imageRef];

  // Get resolved dimensions from geometry cache
  const rect = context.geometry.getNodeAbsoluteBoundingRect(node.id);
  assert(rect, `Bounding rect for node ${node.id} must be defined`);

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
        width: rect.width,
        height: rect.height,
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
  node.layout_target_width = bme.width;
  node.layout_target_height = bme.height;

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

/**
 * Handles flood fill tool pointer down events
 */
export function on_flood_fill(
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

/**
 * Gets the next brush paint color
 */
function get_next_brush_pain_color(
  state: editor.state.IEditorFeatureBrushState,
  fallback?: cg.RGBA32F
): cmath.Vector4 {
  const [r, g, b, a] = kolor.colorformats.intoU8Chunk(
    state.brush_color ?? fallback ?? kolor.colorformats.RGBA32F.BLACK,
    "f32"
  );
  return [r, g, b, a ?? 1];
}

/**
 * Handles brush gesture end
 */
export function on_brush_gesture_end() {
  editor.__global_editors.bitmap?.close();
}

// Helper function - needs to be imported or defined
// TODO: Remove this duplicate function and use a shared implementation.
//   This function is duplicated in:
//   - event-target.reducer.ts
//   - event-target.cem-vector.reducer.ts
//   Future refactoring should extract this to a shared helper that:
//   1. Filters out locked containers (currently missing)
//   2. Applies root node filtering for consistency
//   3. Preserves z-order (top-to-bottom, deepest first)
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
