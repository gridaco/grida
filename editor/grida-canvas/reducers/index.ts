import type { Action, InternalAction, EditorAction } from "../action";
import { produce as immerProduce, type Draft, type Patch } from "immer";
import {
  self_update_gesture_transform,
  self_updateSurfaceHoverState,
  self_insertSubDocument,
} from "./methods";
import eventTargetReducer from "./event-target.reducer";
import documentReducer from "./document.reducer";
import grida from "@grida/schema";
import { editor } from "@/grida-canvas";
import { v4 } from "uuid";
import {
  produceWithHistory as produce,
  consumeHistoryPatches,
} from "./history/patches";

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
    case "scenes/new": {
      const { scene } = action;
      const new_scene = grida.program.document.init_scene(
        scene ?? {
          id: v4(),
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

      return produce(state, (draft) => {
        // 0. add the new scene
        draft.document.scenes[new_scene.id] = new_scene;
        // 1. change the scene_id
        draft.scene_id = new_scene.id;
        // 2. clear scene-specific state
        Object.assign(draft, editor.state.__RESET_SCENE_STATE);
      });
    }
    case "scenes/delete": {
      const { scene } = action;
      return produce(state, (draft) => {
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
        Object.assign(draft, editor.state.__RESET_SCENE_STATE);
      });
    }
    case "scenes/duplicate": {
      const { scene: scene_id } = action;

      // check if the scene exists
      const origin = state.document.scenes[scene_id];
      if (!origin) return state;

      const next = grida.program.document.init_scene({
        ...origin,
        id: context.idgen.next(),
        name: origin.name + " copy",
        order: origin.order ? origin.order + 1 : undefined,
        children: [],
      });

      return produce(state, (draft) => {
        // 0. add the new scene
        draft.document.scenes[next.id] = next;
        // 1. change the scene_id to the new scene
        draft.scene_id = next.id;
        // 2. clear scene-specific state
        Object.assign(draft, editor.state.__RESET_SCENE_STATE);

        // 3. clone nodes recursively
        for (const child_id of origin.children) {
          const prototype =
            grida.program.nodes.factory.createPrototypeFromSnapshot(
              state.document,
              child_id
            );
          const sub =
            grida.program.nodes.factory.create_packed_scene_document_from_prototype(
              prototype,
              () => context.idgen.next()
            );
          self_insertSubDocument(draft, null, sub);
        }
      });
    }
    case "scenes/change/name": {
      const { scene, name } = action;
      return produce(state, (draft) => {
        draft.document.scenes[scene].name = name;
      });
    }
    case "scenes/change/background-color": {
      const { scene } = action;
      return produce(state, (draft) => {
        draft.document.scenes[scene].backgroundColor = action.backgroundColor;
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
      return historyExtension(state, action, _reducer(state, action, context));
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

  return immerProduce(next, (draft) => {
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
      return produce(state, (draft: Draft<S>) => {
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
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/translate-with-axis-lock": {
      return produce(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.tarnslate_with_axis_lock =
          action.tarnslate_with_axis_lock;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/translate-with-force-disable-snap": {
      return produce(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.translate_with_force_disable_snap =
          action.translate_with_force_disable_snap;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/transform-with-center-origin": {
      return produce(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.transform_with_center_origin =
          action.transform_with_center_origin;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/transform-with-preserve-aspect-ratio": {
      return produce(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.transform_with_preserve_aspect_ratio =
          action.transform_with_preserve_aspect_ratio;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/rotate-with-quantize": {
      return produce(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.rotate_with_quantize =
          action.rotate_with_quantize;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/curve-tangent-mirroring": {
      return produce(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.curve_tangent_mirroring =
          action.curve_tangent_mirroring;
      });
    }
    case "config/modifiers/path-keep-projecting": {
      return produce(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.path_keep_projecting =
          action.path_keep_projecting;
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
      return eventTargetReducer(state, action, context);
    }
    // history actions
    default:
      return documentReducer(state, action, context);
  }
  //
}
