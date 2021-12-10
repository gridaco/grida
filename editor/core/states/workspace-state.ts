import { config } from "@designto/config";
import { HistoryState } from "core/states/history-state";

export interface WorkspaceState {
  history: HistoryState;
  preferences: {
    debug_mode: boolean;
    framework_config: config.FrameworkConfig;
    preview_runner_framework_config: config.FrameworkConfig;
    enable_preview_feature_components_support: boolean;
  };
}
