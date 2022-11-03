import { config } from "@grida/builder-config";
import { HistoryState } from "core/states/history-state";

export interface WorkspaceState {
  history: HistoryState;
  /**
   * hovered layer; single or none.
   */
  highlightedLayer?: string;
  preferences: WorkspacePreferences;

  /**
   * figma authentication data store state
   */
  figmaAuthentication?: {
    accessToken?: string;
    personalAccessToken?: string;
  };

  /**
   * figma user data
   */
  figmaUser?: {
    /** Unique stable id of the user */
    id: string;
    /** Name of the user */
    name: string;
    /** URL link to the user's profile image */
    profile: string;
  };
}

export interface WorkspacePreferences {
  debug_mode: boolean;
  framework_config: config.FrameworkConfig;
  preview_runner_framework_config: config.FrameworkConfig;
  enable_preview_feature_components_support: boolean;
}
