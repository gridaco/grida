import { produce, type Draft } from "immer";

import type { SurfaceAction } from "../action";
import {
  DEFAULT_GAP_ALIGNMENT_TOLERANCE,
  type CursorModeType,
  type IDocumentEditorState,
  type LayoutSnapshot,
} from "../state";
import { document } from "../document-query";
import { getInitialCurveGesture } from "./tools/gesture";
import assert from "assert";
import { cmath } from "@grida/cmath";
import { domapi } from "../domapi";
import { grida } from "@/grida";
import { self_selectNode } from "./methods";
import { createMinimalDocumentStateSnapshot } from "./tools/snapshot";

export default function surfaceReducer<S extends IDocumentEditorState>(
  state: S,
  action: SurfaceAction
): S {
  switch (action.type) {
    // #region [universal backend] canvas event target
    case "surface/content-edit-mode/try-enter": {
      if (state.selection.length !== 1) break;
      const node_id = state.selection[0];
      const node = document.__getNodeById(state, node_id);

      return produce(state, (draft) => {
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
          // case "vector":
          case "path": {
            draft.content_edit_mode = {
              type: "path",
              node_id: node_id,
              selected_vertices: [],
              a_point: null,
              next_ta: null,
              path_cursor_position: draft.pointer.position,
            };
            break;
          }
          // TODO: experimental - remove me
          // case "rectangle":
          // case "ellipse": {
          //   if (node.fill?.type === "linear_gradient") {
          //     draft.content_edit_mode = {
          //       type: "gradient",
          //       node_id: node_id,
          //     };
          //   }
          //   //
          // }
        }
      });

      break;
    }
    case "surface/content-edit-mode/try-exit": {
      return produce(state, (draft) => {
        draft.content_edit_mode = undefined;
      });
    }
    case "surface/cursor-mode": {
      const { cursor_mode } = action;
      const path_edit_mode_valid_cursor_modes: CursorModeType[] = [
        "cursor",
        "hand",
        "path",
      ];
      const text_edit_mode_valid_cursor_modes: CursorModeType[] = ["cursor"];
      return produce(state, (draft) => {
        // validate cursor mode
        if (draft.content_edit_mode) {
          switch (draft.content_edit_mode.type) {
            case "path":
              if (!path_edit_mode_valid_cursor_modes.includes(cursor_mode.type))
                return;
              break;
            case "text":
              if (!text_edit_mode_valid_cursor_modes.includes(cursor_mode.type))
                return;
              break;
          }
        }

        draft.cursor_mode = cursor_mode;
      });
    }
    case "surface/gesture/start": {
      const { gesture } = action;

      const cdom = new domapi.CanvasDOM(state.transform);

      switch (gesture.type) {
        case "curve": {
          const { node_id, segment, control } = gesture;

          assert(state.content_edit_mode?.type === "path");
          assert(state.content_edit_mode?.node_id === node_id);

          return produce(state, (draft) => {
            draft.gesture = getInitialCurveGesture(state, {
              node_id,
              segment,
              control,
              invert: false,
            });
          });
        }
        case "scale": {
          const { selection, direction } = gesture;
          //

          return produce(state, (draft) => {
            draft.content_edit_mode = undefined;
            draft.hovered_node_id = null;

            self_start_gesture_scale(draft, {
              selection: selection,
              direction: direction,
              cdom,
            });
          });
          //
        }
        case "corner-radius": {
          const { node_id } = gesture;

          return produce(state, (draft) => {
            self_selectNode(draft, "reset", node_id);
            draft.gesture = {
              type: "corner-radius",
              movement: cmath.vector2.zero,
              initial_bounding_rectangle: cdom.getNodeBoundingRect(node_id)!,
              node_id: node_id,
            };
          });
        }
        case "rotate": {
          const { selection } = gesture;

          return produce(state, (draft) => {
            self_selectNode(draft, "reset", selection);
            self_start_gesture_rotate(draft, {
              selection: selection,
              initial_bounding_rectangle: cdom.getNodeBoundingRect(selection)!,
              // TODO: the offset of rotation handle relative to the center of the rectangle
              offset: cmath.vector2.zero,
            });
          });
          //
        }
        case "translate-vertex": {
          return produce(state, (draft) => {
            const { vertex: index } = gesture;

            const { content_edit_mode } = draft;
            assert(content_edit_mode && content_edit_mode.type === "path");
            const { node_id } = content_edit_mode;
            const node = document.__getNodeById(
              draft,
              node_id
            ) as grida.program.nodes.PathNode;

            const verticies = node.vectorNetwork.vertices.map((v) => v.p);

            content_edit_mode.selected_vertices = [index];
            content_edit_mode.a_point = index;

            draft.gesture = {
              type: "translate-vertex",
              node_id: node_id,
              initial_verticies: verticies,
              vertex: index,
              movement: cmath.vector2.zero,
              initial_position: [node.left!, node.top!],
            };
          });
          //
        }
        case "sort": {
          const { selection, node_id } = gesture;
          return produce(state, (draft) => {
            const layout = createLayoutSnapshot(state, selection);
            const initial_index = layout.objects.findIndex(
              (it) => it.id === node_id
            );
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
            };

            draft.dropzone = {
              type: "rect",
              rect: initial_placement.rect,
            };
          });
        }
        case "gap": {
          const { selection, axis } = gesture;
          return produce(state, (draft) => {
            const layout = createLayoutSnapshot(state, selection);
            layout.objects.sort((a, b) => a[axis] - b[axis]);

            const [gap] = cmath.rect.getUniformGap(
              layout.objects,
              axis,
              DEFAULT_GAP_ALIGNMENT_TOLERANCE
            );

            assert(gap !== undefined, "gap is not uniform");

            // the negaive size of the smallet object or the first sorted object's size (+1)
            const min_gap =
              -Math.min(
                ...layout.objects.map((it) =>
                  cmath.rect.getAxisDimension(it, axis)
                )
              ) + 1;

            draft.gesture = {
              type: "gap",
              axis,
              layout,
              min_gap: min_gap,
              initial_gap: gap,
              gap: gap,
              movement: cmath.vector2.zero,
            };
          });
        }
      }
    }
    // #endregion
  }
  //
  return state;
}

function createLayoutSnapshot(
  state: IDocumentEditorState,
  group: string[]
): LayoutSnapshot {
  const cdom = new domapi.CanvasDOM(state.transform);

  const objects: LayoutSnapshot["objects"] = group.map((node_id) => {
    const rect = cdom.getNodeBoundingRect(node_id)!;

    return {
      ...rect,
      id: node_id,
    };
  });

  return {
    objects,
  };
}

function self_start_gesture_scale(
  draft: Draft<IDocumentEditorState>,
  {
    selection,
    direction,
    cdom,
  }: {
    selection: string[];
    direction: cmath.CardinalDirection;
    cdom: domapi.CanvasDOM;
  }
) {
  if (selection.length === 0) return;
  const rects = selection.map((node_id) => cdom.getNodeBoundingRect(node_id)!);

  draft.gesture = {
    type: "scale",
    initial_snapshot: createMinimalDocumentStateSnapshot(draft),
    initial_rects: rects,
    movement: cmath.vector2.zero,
    selection: selection,
    direction: direction,
  };

  let i = 0;
  for (const node_id of selection) {
    const node = document.__getNodeById(draft, node_id);
    const rect = rects[i++];

    // once the node's measurement mode is set to fixed (from drag start), we may safely cast the width / height sa fixed number
    // need to assign a fixed size if width or height is a variable length
    const _node = node as grida.program.nodes.i.ICSSDimension;
    if (typeof _node.width !== "number") {
      _node.width = rect.width;
    }
    if (typeof _node.height !== "number") {
      if (node.type === "line") {
        _node.height = 0;
      } else {
        _node.height = rect.height;
      }
    }
  }
}

function self_start_gesture_rotate(
  draft: Draft<IDocumentEditorState>,
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
  const { rotation } = document.__getNodeById(
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
  };
}
