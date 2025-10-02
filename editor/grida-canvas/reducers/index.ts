import type { Action, EditorAction } from "../action";
import { produce, produceWithPatches, type Draft, type Patch } from "immer";
import {
  self_update_gesture_transform,
  self_updateSurfaceHoverState,
} from "./methods";
import eventTargetReducer from "./event-target.reducer";
import documentReducer from "./document.reducer";
import grida from "@grida/schema";
import { editor } from "@/grida-canvas";
import { produceWithHistory, consumeHistoryPatches } from "./history/patches";

export type ReducerContext = {
  idgen: grida.id.INodeIdGenerator<string>;
  geometry: editor.api.IDocumentGeometryQuery;
  vector?: editor.api.IDocumentVectorInterfaceActions | null;
  logger?: (...args: any[]) => void;
  viewport: {
    width: number;
    height: number;
  };
  backend: "dom" | "canvas";
  paint_constraints: editor.config.IEditorRenderingConfig["paint_constraints"];
};

export default function reducer(
  state: editor.state.IEditorState,
  action: Action,
  context: ReducerContext
): editor.state.IEditorState {
  // [editor.state.IEditorState, Patch[]]
  if (
    state.debug &&
    !(
      action.type === "event-target/event/on-pointer-move" ||
      action.type === "event-target/event/on-pointer-move-raycast" ||
      action.type === "event-target/event/on-drag"
    )
  ) {
    context.logger?.("debug:action", action.type, action);
  }

  switch (action.type) {
    case "__internal/webfonts#webfontList": {
      const { webfontlist } = action;
      return produce(state, (draft) => {
        draft.webfontlist = webfontlist;
      });
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

      return produce(state, (draft) => {
        // 1. change the scene_id
        draft.scene_id = scene;
        // 2. clear scene-specific state
        Object.assign(draft, editor.state.__RESET_SCENE_STATE);
      });
    }
    case "transform": {
      const { transform, sync } = action;
      return produce(state, (draft) => {
        // set the transform
        draft.transform = transform;

        // TODO: need to update the pointer position (recalculate)
        // ...

        // sync hooked events
        if (sync) {
          self_updateSurfaceHoverState(draft);
        }
      });
    }
    case "undo":
      if (state.history.past.length === 0) {
        return state;
      } else {
        return produce(state, (draft) => {
          const nextPresent = draft.history.past.pop();
          if (nextPresent) {
            draft.history.future.unshift({
              ...nextPresent,
              timestamp: Date.now(),
            });
            editor.history.apply(draft, nextPresent.inversePatches);
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
            draft.history.past.push({
              ...nextPresent,
              timestamp: Date.now(),
            });
            editor.history.apply(draft, nextPresent.patches);
          }
        });
      }
    case "clip/color": {
      return produce(state, (draft) => {
        draft.user_clipboard_color = action.color;
        draft.brush_color = action.color;
      });
    }

    default:
      const next = _reducer(state, action, context);
      return historyExtension(state, action, next);
  }
}

function historyExtension<S extends editor.state.IEditorState>(
  prev: S,
  action: EditorAction,
  next: S
): S {
  const patchesEntry = consumeHistoryPatches(next);
  if (!patchesEntry) {
    return next;
  }

  const patches = editor.history.filterDocumentPatches(patchesEntry.patches);
  const inversePatches = editor.history.filterDocumentPatches(
    patchesEntry.inversePatches
  );

  if (patches.length === 0 && inversePatches.length === 0) {
    return next;
  }

  return produce(next, (draft) => {
    const entry = editor.history.entry(action.type, patches, inversePatches);
    const mergableEntry = editor.history.getMergableEntry(
      prev.history.past,
      entry.timestamp
    );

    if (mergableEntry) {
      draft.history.past[draft.history.past.length - 1] = {
        actionType: action.type,
        timestamp: entry.timestamp,
        patches: mergableEntry.patches.concat(entry.patches),
        inversePatches: entry.inversePatches.concat(
          mergableEntry.inversePatches
        ),
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

function _reducer<S extends editor.state.IEditorState>(
  state: S,
  action: EditorAction,
  context: ReducerContext
): S {
  switch (action.type) {
    case "config/surface/raycast-targeting": {
      const { config } = action;
      return produceWithHistory(state, (draft: Draft<S>) => {
        if (config.target)
          draft.pointer_hit_testing_config.target = config.target;
        if (config.ignores_locked)
          draft.pointer_hit_testing_config.ignores_locked =
            config.ignores_locked;
        if (config.ignores_root_with_children)
          draft.pointer_hit_testing_config.ignores_root_with_children =
            config.ignores_root_with_children;
        self_updateSurfaceHoverState(draft);
      });
    }
    case "config/surface/measurement": {
      const { measurement } = action;
      return produceWithHistory(state, (draft: Draft<S>) => {
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
      return produceWithHistory(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.translate_with_clone =
          action.translate_with_clone;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/translate-with-axis-lock": {
      return produceWithHistory(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.tarnslate_with_axis_lock =
          action.tarnslate_with_axis_lock;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/translate-with-force-disable-snap": {
      return produceWithHistory(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.translate_with_force_disable_snap =
          action.translate_with_force_disable_snap;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/transform-with-center-origin": {
      return produceWithHistory(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.transform_with_center_origin =
          action.transform_with_center_origin;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/transform-with-preserve-aspect-ratio": {
      return produceWithHistory(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.transform_with_preserve_aspect_ratio =
          action.transform_with_preserve_aspect_ratio;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/rotate-with-quantize": {
      return produceWithHistory(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.rotate_with_quantize =
          action.rotate_with_quantize;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/curve-tangent-mirroring": {
      return produceWithHistory(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.curve_tangent_mirroring =
          action.curve_tangent_mirroring;
      });
    }
    case "config/modifiers/path-keep-projecting": {
      return produceWithHistory(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.path_keep_projecting =
          action.path_keep_projecting;
      });
    }
    case "gesture/nudge": {
      return produceWithHistory(state, (draft: Draft<S>) => {
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
      return eventTargetReducer(state, action, context);
    }
    // history actions
    default:
      return documentReducer(state, action, context);
  }
  //
}
