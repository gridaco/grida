import { EditorSnapshot } from "./editor-state";
import { WorkspaceState } from "./workspace-state";
import {
  createInitialHistoryState,
  createPendingHistoryState,
} from "./history-initial-state";
import { react_presets, vanilla_presets } from "@grida/builder-config-preset";

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

export function createInitialWorkspaceState(
  editor: EditorSnapshot
): WorkspaceState {
  return {
    history: createInitialHistoryState(editor),
    preferences: {
      debug_mode: _IS_DEV,
      enable_preview_feature_components_support:
        _ENABLE_PREVIEW_FEATURE_COMPONENTS_SUPPORT,
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
