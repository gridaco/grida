import type { Draft } from "immer";
import { editor } from "@/grida-canvas";
import { getRayTarget } from "../tools/target";

/**
 * Validates and corrects hover state consistency.
 * Ensures hovered_node_id and hovered_node_source are always in sync.
 *
 * @internal
 */
export function __validateHoverState<S extends editor.state.IEditorState>(
  draft: Draft<S>
) {
  // If hovered_node_id is null, source should also be null
  if (draft.hovered_node_id === null && draft.hovered_node_source !== null) {
    draft.hovered_node_source = null;
  }
  // If source is UI-triggered (title-bar or hierarchy-tree), hovered_node_id should be set
  if (
    draft.hovered_node_source !== null &&
    draft.hovered_node_source !== "hit-test" &&
    draft.hovered_node_id === null
  ) {
    draft.hovered_node_source = null;
  }
}

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

  // Preserve hover state when hovering over a title bar (UI-triggered hover)
  // Title bars have no geometry in hit-testing, so we skip updating hovered_node_id
  // when a title bar hover is active to prevent clearing the hover state
  if (draft.hovered_node_source !== "title-bar") {
    draft.hovered_node_id = normalHoverTarget;
    draft.hovered_node_source = normalHoverTarget ? "hit-test" : null;
  }

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

  // Validate hover state consistency
  __validateHoverState(draft);

  return draft;
}
