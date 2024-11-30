import { produce, type Draft } from "immer";
import type { IDocumentEditorState, SurfaceRaycastTargeting } from "../types";
import type { BuilderAction } from "../action";
// import historyReducer from "./history.reducer";
import documentReducer from "./document.reducer";

export default function reducer<S extends IDocumentEditorState>(
  state: S,
  action: BuilderAction
): S {
  switch (action.type) {
    case "__internal/reset": {
      const { state: _new_state, key } = action;
      return produce(_new_state, (draft) => {
        if (key) draft.document_key = key;
      }) as S;
    }
    case "__internal/sync-artboard-offset": {
      return produce(state, (draft: Draft<S>) => {
        draft.translate = action.offset;
      });
    }
    default:
      return documentReducer(state, action);
  }
}
