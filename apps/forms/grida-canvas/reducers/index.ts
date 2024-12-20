import type { IDocumentEditorState } from "../state";
import type { Action, EditorAction } from "../action";
import { produce, type Draft } from "immer";
import {
  self_update_gesture_transform,
  self_updateSurfaceHoverState,
} from "./methods";
import { history } from "./history";
import eventTargetReducer from "./event-target.reducer";
import documentReducer from "./document.reducer";
import equal from "deep-equal";

export default function reducer<S extends IDocumentEditorState>(
  state: S,
  action: Action
): S {
  switch (action.type) {
    case "__internal/reset": {
      const { state: _new_state, key } = action;
      return produce(_new_state, (draft) => {
        if (key) draft.document_key = key;
      }) as S;
    }
    case "__internal/on-resize": {
      return produce(state, (draft: Draft<S>) => {
        draft.viewport_offset = action.viewport_offset;
        draft.content_offset = action.content_offset;
        // TODO: apply delta to cursor position
        // const delta = cmath.vector2.subtract(...)
        // draft.surface_cursor_position =
        // draft.cursor_position =
      });
    }
    case "undo":
      if (state.history.past.length === 0) {
        return state;
      } else {
        return produce(state, (draft) => {
          const nextPresent = draft.history.past.pop();
          if (nextPresent) {
            draft.history.future.unshift(
              history.entry(nextPresent.actionType, history.snapshot(state))
            );
            history.apply(draft, nextPresent.state);
          }
        });
      }
    case "redo":
      if (state.history.future.length === 0) {
        return state;
      } else {
        return produce(state, (draft) => {
          const nextPresent = draft.history.future.shift();
          if (nextPresent) {
            draft.history.past.push(
              history.entry(nextPresent.actionType, history.snapshot(state))
            );
            history.apply(draft, nextPresent.state);
          }
        });
      }
    default:
      return historyExtension(state, action, _reducer(state, action));
  }
}

function historyExtension<S extends IDocumentEditorState>(
  prev: S,
  action: EditorAction,
  next: S
): S {
  //
  // checks if there is change in the document state, take snapshot
  //
  const hasChanged = !equal(prev.document, next.document);
  if (!hasChanged) return next;
  return produce(next, (draft) => {
    const entry = history.entry(action.type, prev);
    const mergableEntry = history.getMergableEntry(prev.history.past);

    if (mergableEntry) {
      draft.history.past[draft.history.past.length - 1] = {
        ...entry,
        state: mergableEntry.state,
      };
    } else {
      const max_history = 100;
      if (draft.history.past.length >= max_history) {
        draft.history.past.shift(); // Remove the oldest entry
      }
      draft.history.past.push(entry);
    }

    draft.history.future = [];
  });
}

function _reducer<S extends IDocumentEditorState>(
  state: S,
  action: EditorAction
): S {
  switch (action.type) {
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
    case "config/modifiers/translate-with-clone": {
      return produce(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.translate_with_clone =
          action.translate_with_clone;
        self_update_gesture_transform(draft);
      });
    }
    case "config/modifiers/translate-with-axis-lock": {
      return produce(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.tarnslate_with_axis_lock =
          action.tarnslate_with_axis_lock;
        self_update_gesture_transform(draft);
      });
    }
    case "config/modifiers/transform-with-center-origin": {
      return produce(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.transform_with_center_origin =
          action.transform_with_center_origin;
        self_update_gesture_transform(draft);
      });
    }
    case "config/modifiers/transform-with-preserve-aspect-ratio": {
      return produce(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.transform_with_preserve_aspect_ratio =
          action.transform_with_preserve_aspect_ratio;
        self_update_gesture_transform(draft);
      });
    }
    case "config/modifiers/rotate-with-quantize": {
      return produce(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.rotate_with_quantize =
          action.rotate_with_quantize;
        self_update_gesture_transform(draft);
      });
    }
    case "gesture/nudge": {
      return produce(state, (draft: Draft<S>) => {
        const { state } = action;
        switch (state) {
          case "on": {
            draft.gesture = { type: "nudge" };
            break;
          }
          case "off": {
            draft.gesture = undefined;
            break;
          }
        }
      });
    }
    case "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag":
    case "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag-end":
    case "document/canvas/backend/html/event/node-overlay/corner-radius-handle/on-drag-start":
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag":
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-end":
    case "document/canvas/backend/html/event/node-overlay/resize-handle/on-drag-start":
    case "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag":
    case "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag-end":
    case "document/canvas/backend/html/event/node-overlay/rotation-handle/on-drag-start":
    case "document/canvas/backend/html/event/node-overlay/on-click":
    case "document/canvas/backend/html/event/node-overlay/on-drag":
    case "document/canvas/backend/html/event/node-overlay/on-drag-end":
    case "document/canvas/backend/html/event/node-overlay/on-drag-start":
    case "document/canvas/backend/html/event/node/on-pointer-enter":
    case "document/canvas/backend/html/event/node/on-pointer-leave":
    case "document/canvas/backend/html/event/on-click":
    case "document/canvas/backend/html/event/on-double-click":
    case "document/canvas/backend/html/event/on-drag":
    case "document/canvas/backend/html/event/on-drag-end":
    case "document/canvas/backend/html/event/on-drag-start":
    case "document/canvas/backend/html/event/on-pointer-down":
    case "document/canvas/backend/html/event/on-pointer-move":
    case "document/canvas/backend/html/event/on-pointer-move-raycast":
    case "document/canvas/backend/html/event/on-pointer-up": {
      return eventTargetReducer(state, action);
    }
    // history actions
    default:
      return documentReducer(state, action);
  }
  //
}
