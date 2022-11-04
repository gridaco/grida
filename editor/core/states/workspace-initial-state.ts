import { EditorSnapshot } from "./editor-state";
import { WorkspaceState } from "./workspace-state";
import {
  createInitialHistoryState,
  createPendingHistoryState,
} from "./history-initial-state";
import { react_presets, vanilla_presets } from "@grida/builder-config-preset";
import { WorkspacePreferenceStore } from "store/workspace-preference-store";

const _IS_DEV = process.env.NODE_ENV === "development";

/**
 * you can enable this by default on your .env.local file
 *
 * ```.env.local
 * NEXT_PUBLIC_ENABLE_PREVIEW_FEATURE_COMPONENTS_SUPPORT=true
 * ```
 */
const _ENABLE_PREVIEW_FEATURE_COMPONENTS_SUPPORT =
  process.env.NEXT_PUBLIC_ENABLE_PREVIEW_FEATURE_COMPONENTS_SUPPORT === "true";

/**
 * this gets called when the editor snapshot is ready, returns the initial workspace state merged with editor snapshot's value.
 */
export function merge_initial_workspace_state_with_editor_snapshot(
  base: Partial<WorkspaceState>,
  snapshot: EditorSnapshot
): WorkspaceState {
  const pref_store = new WorkspacePreferenceStore();
  const saved_pref = pref_store.load();
  const default_pref = {
    debug_mode: _IS_DEV,
    enable_preview_feature_components_support:
      _ENABLE_PREVIEW_FEATURE_COMPONENTS_SUPPORT,
    preview_runner_framework_config: vanilla_presets.vanilla_default,
    framework_config: react_presets.react_default,
  };
  if (!saved_pref) pref_store.set(default_pref);

  return {
    ...base,
    // below fields will be overwritten irrelevent to the existing base.
    history: createInitialHistoryState(snapshot),
    preferences: saved_pref ?? default_pref,
  };
}

export function create_initial_pending_workspace_state(): WorkspaceState {
  return {
    history: createPendingHistoryState(),
    preferences: {
      debug_mode: null,
      enable_preview_feature_components_support: null,
      preview_runner_framework_config: null,
      framework_config: null,
    },
  };
}
