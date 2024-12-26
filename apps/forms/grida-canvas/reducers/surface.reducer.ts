import { produce, type Draft } from "immer";

import type { SurfaceAction } from "../action";
import type { IDocumentEditorState } from "../state";
import { document } from "../document-query";
import { getInitialCurveGesture } from "./tools/gesture";
import assert from "assert";
import { cmath } from "../cmath";
import { domapi } from "../domapi";
import { grida } from "@/grida";
import { self_selectNode } from "./methods";

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
          case "vector":
          case "path": {
            draft.content_edit_mode = {
              type: "path",
              node_id: node_id,
              selected_vertices: [],
              a_point: null,
              path_cursor_position: draft.cursor_position,
            };
            break;
          }
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
      return produce(state, (draft) => {
        draft.cursor_mode = cursor_mode;
      });
    }
    case "surface/gesture/start": {
      const { gesture } = action;
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
            });
          });
          //
        }
        case "corner-radius": {
          const { selection } = gesture;

          return produce(state, (draft) => {
            self_selectNode(draft, "reset", selection);
            draft.gesture = {
              type: "corner-radius",
              initial_bounding_rectangle:
                domapi.get_node_bounding_rect(selection)!,
              selection,
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

function self_start_gesture_scale(
  draft: Draft<IDocumentEditorState>,
  {
    selection,
    direction,
  }: {
    selection: string[];
    direction: cmath.CardinalDirection;
  }
) {
  if (selection.length === 0) return;
  const rects = selection.map(
    (node_id) => domapi.get_node_bounding_rect(node_id)!
  );

  draft.gesture = {
    type: "scale",
    initial_snapshot: JSON.parse(JSON.stringify(draft.document)),
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
