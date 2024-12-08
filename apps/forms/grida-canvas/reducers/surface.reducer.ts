import { produce, type Draft } from "immer";

import type { SurfaceAction } from "../action";
import type { IDocumentEditorState } from "../types";
import { documentquery } from "../document-query";

export default function surfaceReducer<S extends IDocumentEditorState>(
  state: S,
  action: SurfaceAction
): S {
  switch (action.type) {
    // #region [universal backend] canvas event target
    case "document/surface/content-edit-mode/try-enter": {
      if (state.selection.length !== 1) break;
      const node_id = state.selection[0];
      const node = documentquery.__getNodeById(state, node_id);

      // only text node can enter the content edit mode
      if (node.type !== "text") return state;

      // the text node should have a string literal value assigned (we don't support props editing via surface)
      if (typeof node.text !== "string") return state;

      return produce(state, (draft) => {
        draft.content_edit_mode = "text";
      });
      break;
    }
    case "document/surface/content-edit-mode/try-exit": {
      return produce(state, (draft) => {
        draft.content_edit_mode = false;
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
