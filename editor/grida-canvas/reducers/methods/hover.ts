import type { Draft } from "immer";
import { editor } from "@/grida-canvas";
import { getRayTarget } from "../tools/target";

export function self_updateSurfaceHoverState<
  S extends editor.state.IEditorState,
>(draft: Draft<S>) {
  if (
    // do not change the hovered node if the content edit mode is on
    draft.content_edit_mode ||
    // do not change the hovered node if the gesture is...
    draft.gesture.type === "draw" ||
    draft.gesture.type === "rotate" ||
    draft.gesture.type === "scale" ||
    draft.gesture.type === "nudge" ||
    draft.gesture.type === "corner-radius"
  ) {
    return draft;
  }

  const target = getRayTarget(draft.hits, {
    config:
      draft.surface_measurement_targeting === "on"
        ? {
            ...draft.pointer_hit_testing_config,
            ...editor.config.MEASUREMENT_HIT_TESTING_CONFIG,
          }
        : draft.pointer_hit_testing_config,
    context: draft,
  });

  draft.hovered_node_id = target;

  if (
    target &&
    draft.surface_measurement_targeting === "on" &&
    !draft.surface_measurement_targeting_locked
  ) {
    draft.surface_measurement_target = [target];
  }

  return draft;
}
