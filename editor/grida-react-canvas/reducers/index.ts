import { DEFAULT_SCENE_STATE, type IDocumentEditorState } from "../state";
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
import grida from "@grida/schema";
import nid from "./tools/id";

export default function reducer<S extends IDocumentEditorState>(
  state: S,
  action: Action
): S {
  if (
    state.debug &&
    !(
      action.type === "event-target/event/on-pointer-move" ||
      action.type === "event-target/event/on-pointer-move-raycast" ||
      action.type === "event-target/event/on-drag"
    )
  ) {
    console.log("debug:action", action.type, action);
  }

  switch (action.type) {
    case "__internal/reset": {
      const { state: _new_state, key } = action;
      const prev_state = state;
      return produce(_new_state, (draft) => {
        if (key) draft.document_key = key;
        // preserve the transform state
        draft.transform = prev_state.transform;
      }) as S;
    }
    case "load": {
      const { scene } = action;

      // check if the scene exists
      if (!state.document.scenes[scene]) {
        return state;
      }

      // check if already loaded
      if (state.scene_id === scene) {
        return state;
      }

      return produce(state, (draft: Draft<S>) => {
        // 1. change the scene_id
        draft.scene_id = scene;
        // 2. clear scene-specific state
        Object.assign(draft, DEFAULT_SCENE_STATE);
      });
    }
    case "scenes/new": {
      const { scene } = action;
      const new_scene = grida.program.document.init_scene(
        scene ?? {
          id: nid(), // TODO: use other than nid
          name: `Scene ${Object.keys(state.document.scenes).length + 1}`,
          order: Object.keys(state.document.scenes).length,
        }
      );

      const scene_id = new_scene.id;
      // check if the scene id does not conflict
      if (state.document.scenes[scene_id]) {
        console.error(`Scene id ${scene_id} already exists`);
        return state;
      }

      return produce(state, (draft: Draft<S>) => {
        // 0. add the new scene
        draft.document.scenes[new_scene.id] = new_scene;
        // 1. change the scene_id
        draft.scene_id = new_scene.id;
        // 2. clear scene-specific state
        Object.assign(draft, DEFAULT_SCENE_STATE);
      });
    }
    case "scenes/delete": {
      const { scene } = action;
      return produce(state, (draft: Draft<S>) => {
        // 0. remove the scene
        delete draft.document.scenes[scene];
        // 1. change the scene_id
        if (draft.scene_id === scene) {
          draft.scene_id = Object.keys(draft.document.scenes)[0];
        }
        if (draft.document.entry_scene_id === scene) {
          draft.document.entry_scene_id = draft.scene_id;
        }
        // 2. clear scene-specific state
        Object.assign(draft, DEFAULT_SCENE_STATE);
      });
    }
    case "scenes/duplicate": {
      const { scene: scene_id } = action;

      // check if the scene exists
      const origin = state.document.scenes[scene_id];
      if (!origin) return state;

      const next = grida.program.document.init_scene({
        ...origin,
        id: nid(),
        name: origin.name + " copy",
        order: origin.order ? origin.order + 1 : undefined,
      });

      return produce(state, (draft: Draft<S>) => {
        // FIXME: clone nodes entirely
        // 0. add the new scene
        draft.document.scenes[next.id] = next;
        // 1. change the scene_id
        draft.scene_id = next.id;
        // 2. clear scene-specific state
        Object.assign(draft, DEFAULT_SCENE_STATE);
      });
    }
    case "scenes/change/name": {
      const { scene, name } = action;
      return produce(state, (draft: Draft<S>) => {
        draft.document.scenes[scene].name = name;
      });
    }
    case "scenes/change/background-color": {
      const { scene } = action;
      return produce(state, (draft: Draft<S>) => {
        draft.document.scenes[scene].backgroundColor = action.backgroundColor;
      });
    }
    case "transform": {
      return produce(state, (draft: Draft<S>) => {
        const prev_transform = state.transform;
        const next_transform = action.transform;

        // set the transform
        draft.transform = next_transform;

        // TODO: need to update the pointer position (recalculate)
        // ...

        // update hooked events
        self_updateSurfaceHoverState(draft);
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
    case "clip/color": {
      return produce(state, (draft: Draft<S>) => {
        draft.user_clipboard_color = action.color;
        draft.next_paint_color = action.color;
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
        if (config.ignores_root_with_children)
          draft.surface_raycast_targeting.ignores_root_with_children =
            config.ignores_root_with_children;
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
            draft.gesture = { type: "idle" };
            break;
          }
        }
      });
    }
    case "event-target/event/multiple-selection-overlay/on-click":
    case "event-target/event/on-click":
    case "event-target/event/on-double-click":
    case "event-target/event/on-drag":
    case "event-target/event/on-drag-end":
    case "event-target/event/on-drag-start":
    case "event-target/event/on-pointer-down":
    case "event-target/event/on-pointer-move":
    case "event-target/event/on-pointer-move-raycast":
    case "event-target/event/on-pointer-up": {
      return eventTargetReducer(state, action);
    }
    // history actions
    default:
      return documentReducer(state, action);
  }
  //
}
