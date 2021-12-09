import { EditorSnapshot } from "./editor-state";
import { WorkspaceState } from "./workspace-state";
import {
  createInitialHistoryState,
  createPendingHistoryState,
} from "./history-initial-state";
import { react_presets, vanilla_presets } from "@grida/builder-config-preset";

export function createInitialWorkspaceState(
  editor: EditorSnapshot
): WorkspaceState {
  return {
    history: createInitialHistoryState(editor),
    preferences: {
      debug_mode: false,
      enable_preview_feature_components_support: false,
      preview_runner_framework_config: vanilla_presets.vanilla_default,
      framework_config: react_presets.react_default,
    },
  };
}

export function createPendingWorkspaceState(): WorkspaceState {
  return {
    history: createPendingHistoryState(),
    preferences: {
      debug_mode: false,
      enable_preview_feature_components_support: false,
      preview_runner_framework_config: null,
      framework_config: null,
    },
  };
}
