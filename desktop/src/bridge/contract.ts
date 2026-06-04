export {
  DESKTOP_BRIDGE_PROTOCOL,
  DESKTOP_HOST_APP_IDS,
} from "@grida/desktop-bridge";

export type {
  ConfirmOptions,
  DesktopBridge,
  DesktopCapabilities,
  DesktopHostAppId,
  DesktopHostAppInfo,
  DesktopNativeCapabilities,
  FileReadResult,
  FileWriteResult,
  HandshakeResponse,
  NavigationState,
  OpenDialogOptions,
  RecentEntry,
  SaveDialogOptions,
  Workspace,
  WorkspaceFsEntry,
  WorkspaceReadFileBytesResult,
  WorkspaceReadFileResult,
  WorkspaceWriteFileResult,
} from "@grida/desktop-bridge";

export const IPC_CHANNELS = {
  WINDOW_SET_DOCUMENT_EDITED: "grida:window:set-document-edited",
  WINDOW_SET_REPRESENTED_FILENAME: "grida:window:set-represented-filename",
  WINDOW_CLOSE: "grida:window:close",
  WINDOW_NAVIGATION_STATE: "grida:window:navigation:state",
  WINDOW_NAVIGATION_BACK: "grida:window:navigation:back",
  WINDOW_NAVIGATION_FORWARD: "grida:window:navigation:forward",
  WINDOW_NAVIGATION_CHANGED: "grida:window:navigation:changed",
  AGENT_SERVER_INFO: "grida:agent:server-info",
  WORKSPACE_COMMAND: "grida:workspace:command",
  WORKSPACE_TRASH_ENTRY: "grida:workspace:trash-entry",
  DIALOG_CONFIRM: "grida:dialog:confirm",
  DIALOG_OPEN: "grida:dialog:open",
  DIALOG_SAVE_AS: "grida:dialog:save-as",
  SHELL_OPEN_EXTERNAL: "grida:shell:open-external",
  SHELL_SHOW_ITEM_IN_FOLDER: "grida:shell:show-item-in-folder",
  HOST_APPS_RESOLVE_PREFERRED: "grida:host-apps:resolve-preferred",
  HOST_APPS_OPEN_WORKSPACE: "grida:host-apps:open-workspace",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
