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
    case "__internal/sync-artboard-offset": {
      return produce(state, (draft: Draft<S>) => {
        draft.translate = action.offset;
      });
    }
    default:
      return documentReducer(state, action);
  }
}
