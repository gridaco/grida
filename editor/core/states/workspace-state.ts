import { config } from "@grida/builder-config";
import { HistoryState } from "core/states/history-state";

export interface EssentialWorkspaceInfo {
  // Add workspace seed data here, which cannot be automatically filled on initial state.
}

export interface WorkspaceState extends EssentialWorkspaceInfo {
  history: HistoryState;
  /**
   * hovered layer; single or none.
   */
  highlightedLayer?: string;

  taskQueue: TaskQueue;

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

  debugMode?: boolean;
}

export interface TaskQueue {
  isBusy: boolean;
  tasks: BackgroundTask[];
}

export interface BackgroundTask {
  id: string;
  name: string;
  /**
   * If the task is short-lived, wait this much ms before displaying it.
   * @default 200 (0.2s)
   */
  debounce?: number;
  description?: string;
  cancelable?: boolean;
  onCancel?: () => void;
  /**
   * 0-1, if null, it is indeterminate
   */
  progress: number | null;
  createdAt?: Date;
}
