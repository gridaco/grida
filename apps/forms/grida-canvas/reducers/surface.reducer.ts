import { produce, type Draft } from "immer";

import type { SurfaceAction } from "../action";
import type { IDocumentEditorState } from "../state";
import { document } from "../document-query";

export default function surfaceReducer<S extends IDocumentEditorState>(
  state: S,
  action: SurfaceAction
): S {
  switch (action.type) {
    // #region [universal backend] canvas event target
    case "document/surface/content-edit-mode/try-enter": {
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
          case "path":
          case "polyline": {
            draft.content_edit_mode = {
              type: "path",
              node_id: node_id,
              selected_points: [],
            };
            break;
          }
        }
      });

      break;
    }
    case "document/surface/content-edit-mode/try-exit": {
      return produce(state, (draft) => {
        draft.content_edit_mode = undefined;
      });
    }
    case "document/surface/cursor-mode": {
      const { cursor_mode } = action;
      return produce(state, (draft) => {
        draft.cursor_mode = cursor_mode;
      });
    }
    // #endregion
  }
  //
  return state;
}
