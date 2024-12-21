import type { Draft } from "immer";
import type { IDocumentEditorState } from "../../state";
import { getSurfaceRayTarget } from "../tools/target";

export function self_updateSurfaceHoverState<S extends IDocumentEditorState>(
  draft: Draft<S>
) {
  const target = getSurfaceRayTarget(draft.surface_raycast_detected_node_ids, {
    config: draft.surface_raycast_targeting,
    context: draft,
  });

  draft.hovered_node_id = target;

  if (
    draft.surface_measurement_targeting === "on" &&
    !draft.surface_measurement_targeting_locked
  ) {
    if (target) draft.surface_measurement_target = [target];
    else {
      // set root as target
      draft.surface_measurement_target = [draft.document.root_id];
    }
  }

  return draft;
}
