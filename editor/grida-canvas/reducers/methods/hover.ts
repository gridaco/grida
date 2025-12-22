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

  // Always compute normal hover (for selection) - independent of measurement mode
  const normalHoverTarget = getRayTarget(
    draft.hits,
    {
      config: draft.pointer_hit_testing_config, // Normal config
      context: draft,
    },
    false, // nested_first
    false // isMeasurementMode = false
  );
  draft.hovered_node_id = normalHoverTarget;

  // Separately compute measurement target (only when measurement mode is on)
  if (
    draft.surface_measurement_targeting === "on" &&
    !draft.surface_measurement_targeting_locked
  ) {
    const measurementTarget = getRayTarget(
      draft.hits,
      {
        config: {
          ...draft.pointer_hit_testing_config,
          ...editor.config.MEASUREMENT_HIT_TESTING_CONFIG,
        },
        context: draft,
      },
      false, // nested_first
      true // isMeasurementMode = true
    );
    draft.surface_measurement_target = measurementTarget
      ? [measurementTarget]
      : undefined;
  } else if (draft.surface_measurement_targeting === "off") {
    draft.surface_measurement_target = undefined;
  }

  return draft;
}
