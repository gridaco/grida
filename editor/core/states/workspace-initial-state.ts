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
      // TODO: temporarily always true for components dev
      debug_mode: true,
      enable_preview_feature_components_support: true,
      preview_runner_framework_config: vanilla_presets.vanilla_default,
      framework_config: react_presets.react_default,
    },
  };
}

export function createPendingWorkspaceState(): WorkspaceState {
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
