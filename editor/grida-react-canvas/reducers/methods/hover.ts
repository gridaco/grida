import type { Draft } from "immer";
import type { IDocumentEditorState } from "../../state";
import { getRayTarget } from "../tools/target";

export function self_updateSurfaceHoverState<S extends IDocumentEditorState>(
  draft: Draft<S>
) {
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

  const target = getRayTarget(draft.surface_raycast_detected_node_ids, {
    config: draft.surface_raycast_targeting,
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
