import { produce, type Draft } from "immer";
import type { IDocumentEditorState } from "../types";
import type { BuilderAction } from "../action";
// import historyReducer from "./history.reducer";
import documentReducer from "./document.reducer";
import { self_updateSurfaceHoverState } from "./methods";

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
        // TODO: apply delta to cursor position
        // const delta = cmath.vector2.subtract(...)
        // draft.surface_cursor_position =
        // draft.cursor_position =
      });
    }
    case "config/surface/raycast-targeting": {
      const { config } = action;
      return produce(state, (draft: Draft<S>) => {
        if (config.target)
          draft.surface_raycast_targeting.target = config.target;
        if (config.ignores_locked)
          draft.surface_raycast_targeting.ignores_locked =
            config.ignores_locked;
        if (config.ignores_root)
          draft.surface_raycast_targeting.ignores_root = config.ignores_root;
        self_updateSurfaceHoverState(draft);
      });
    }
    case "config/surface/measurement": {
      const { measurement } = action;
      return produce(state, (draft: Draft<S>) => {
        switch (measurement) {
          case "on": {
            draft.surface_measurement_targeting = "on";
            self_updateSurfaceHoverState(draft);
            break;
          }
          case "off": {
            draft.surface_measurement_targeting = "off";
            draft.surface_measurement_target = undefined;
            self_updateSurfaceHoverState(draft);
            break;
          }
        }
      });
      break;
    }
    default:
      return documentReducer(state, action);
  }
}
