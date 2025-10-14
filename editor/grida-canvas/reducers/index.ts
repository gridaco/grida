import type { Action, EditorAction } from "../action";
import {
  enablePatches,
  produceWithPatches,
  type Draft,
  type Patch,
} from "immer";
import { updateState } from "./utils/immer";
import {
  self_update_gesture_transform,
  self_updateSurfaceHoverState,
} from "./methods";
import eventTargetReducer from "./event-target.reducer";
import documentReducer from "./document.reducer";
import grida from "@grida/schema";
import { editor } from "@/grida-canvas";

enablePatches();

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

export type ReducerResult = [editor.state.IEditorState, Patch[], Patch[]];

export default function reducer(
  state: editor.state.IEditorState,
  action: Action,
  context: ReducerContext
): ReducerResult {
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

  const [nextState, patches, inversePatches] = produceWithPatches(
    state,
    (draft) => {
      switch (action.type) {
        case "__internal/webfonts#webfontList": {
          draft.webfontlist = action.webfontlist;
          return;
        }
        case "document/reset": {
          // Special marker action - already handled by reset() method
          // This should never actually reach the reducer, but handle it gracefully
          return;
        }
        case "load": {
          const { scene } = action;

          // Check if scene exists in scenes_ref
          if (!state.document.scenes_ref.includes(scene)) {
            return;
          }

          if (state.scene_id === scene) {
            return;
          }

          draft.scene_id = scene;
          Object.assign(draft, editor.state.__RESET_SCENE_STATE);
          return;
        }
        case "transform": {
          const { transform, sync } = action;
          draft.transform = transform;
          if (sync) {
            self_updateSurfaceHoverState(draft);
          }
          return;
        }
        case "clip/color": {
          draft.user_clipboard_color = action.color;
          draft.brush_color = action.color;
          return;
        }
        default: {
          _reducer(draft as Draft<editor.state.IEditorState>, action, context);
        }
      }
    }
  );

  return [nextState, patches, inversePatches];
}

function _reducer<S extends editor.state.IEditorState>(
  state: S,
  action: EditorAction,
  context: ReducerContext
): S {
  switch (action.type) {
    case "config/surface/raycast-targeting": {
      const { config } = action;
      return updateState(state, (draft: Draft<S>) => {
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
      return updateState(state, (draft: Draft<S>) => {
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
      return updateState(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.translate_with_clone =
          action.translate_with_clone;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/translate-with-axis-lock": {
      return updateState(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.tarnslate_with_axis_lock =
          action.tarnslate_with_axis_lock;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/translate-with-force-disable-snap": {
      return updateState(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.translate_with_force_disable_snap =
          action.translate_with_force_disable_snap;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/transform-with-center-origin": {
      return updateState(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.transform_with_center_origin =
          action.transform_with_center_origin;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/transform-with-preserve-aspect-ratio": {
      return updateState(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.transform_with_preserve_aspect_ratio =
          action.transform_with_preserve_aspect_ratio;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/rotate-with-quantize": {
      return updateState(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.rotate_with_quantize =
          action.rotate_with_quantize;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/curve-tangent-mirroring": {
      return updateState(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.curve_tangent_mirroring =
          action.curve_tangent_mirroring;
      });
    }
    case "config/modifiers/path-keep-projecting": {
      return updateState(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.path_keep_projecting =
          action.path_keep_projecting;
      });
    }
    case "gesture/nudge": {
      return updateState(state, (draft: Draft<S>) => {
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
    default:
      return documentReducer(state, action, context);
  }
}
