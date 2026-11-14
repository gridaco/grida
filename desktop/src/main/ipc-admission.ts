// GRIDA-SEC-004 / GRIDA-SEC-005 — native role-scoped IPC capability policy.
import { IPC_CHANNELS, type IpcChannel } from "../bridge/contract";

export type DesktopIpcRole = "sign-in" | "onboarding" | "main";

const SIGN_IN_CHANNELS = new Set<IpcChannel>([
  // The contained sign-in page asks the fixed same-origin start route for its
  // browser URL, then needs exactly one native capability to open that URL.
  IPC_CHANNELS.SHELL_OPEN_EXTERNAL,
  // The shared compact title bar reads history once. It does not need mutation.
  IPC_CHANNELS.WINDOW_NAVIGATION_STATE,
]);

const ONBOARDING_CHANNELS = new Set<IpcChannel>([
  // ChatGPT subscription setup is an optional onboarding step.
  IPC_CHANNELS.CHATGPT_CONNECT,
  IPC_CHANNELS.CHATGPT_CANCEL,
  IPC_CHANNELS.CHATGPT_STATUS,
  IPC_CHANNELS.CHATGPT_SIGN_OUT,
  // Purpose-scoped main-owned workspace setup. AGENT_SERVER_INFO is a bearer
  // capability for the entire daemon and must remain main-only.
  IPC_CHANNELS.ONBOARDING_WORKSPACE_DEFAULT,
  IPC_CHANNELS.ONBOARDING_WORKSPACE_CHOOSE,
  // This is the sole role-changing capability exposed during onboarding.
  IPC_CHANNELS.WINDOW_COMPLETE_ONBOARDING,
]);

const TOOLS_ONLY_CHANNELS = new Set<IpcChannel>([
  IPC_CHANNELS.MEDIA_LIST,
  IPC_CHANNELS.MEDIA_READ,
  IPC_CHANNELS.MEDIA_SAVE_COPY,
  IPC_CHANNELS.MEDIA_REVEAL,
  IPC_CHANNELS.MEDIA_OPEN_FOLDER,
]);

const PROJECT_CONFIGURATION_CHANNELS = new Set<IpcChannel>([
  IPC_CHANNELS.NATIVE_CHAT_SELECT_PROFILE,
  IPC_CHANNELS.NATIVE_CHAT_HOOKS,
  IPC_CHANNELS.NATIVE_CHAT_IMPORT_HOOK,
  IPC_CHANNELS.NATIVE_CHAT_REMOVE_HOOK,
]);

const WORKBENCH_LIBRARY_CHANNELS = new Set<IpcChannel>([
  IPC_CHANNELS.NATIVE_CHAT_ACCEPTS_LIBRARY_SELECTION,
  IPC_CHANNELS.NATIVE_CHAT_SUBMIT_LIBRARY_SELECTION,
  IPC_CHANNELS.NATIVE_CHAT_LIBRARY_SELECTIONS,
  IPC_CHANNELS.NATIVE_CHAT_ANSWER_LIBRARY_SELECTION,
]);

/**
 * Closed IPC allowlist for non-main entry roles.
 *
 * Main owns the complete Desktop bridge. Sign-in and onboarding receive only
 * the channels their current contained surface invokes; booting, transitions,
 * stale auxiliaries, and signed-out former Settings windows resolve to no role
 * in {@link DesktopEntryWindow.ipcRoleFor} and never reach this policy.
 */
export namespace ipc_admission {
  export function allows({
    role,
    channel,
    pathname,
    selectedDocument = false,
    nestedDeck = false,
  }: {
    role: DesktopIpcRole;
    channel: IpcChannel;
    pathname: string;
    selectedDocument?: boolean;
    nestedDeck?: boolean;
  }): boolean {
    switch (role) {
      case "main":
        // A renderer may commit a contained auth/onboarding navigation before
        // Electron's navigation observer runs. Path admission closes that gap
        // without letting URL state grant a role.
        if (
          pathname === "/desktop/onboarding" ||
          pathname === "/desktop/auth" ||
          pathname.startsWith("/desktop/auth/")
        ) {
          return false;
        }
        if (TOOLS_ONLY_CHANNELS.has(channel)) {
          return pathname === "/desktop/tools";
        }
        if (
          WORKBENCH_LIBRARY_CHANNELS.has(channel) ||
          channel === IPC_CHANNELS.NATIVE_CHAT_TAKE_NOTIFICATION_FOCUS
        ) {
          return pathname === "/desktop/workspace";
        }
        // The Welcome composer lists connections for a chat it hands to the
        // workspace it opens; it never reaches a workspace chat itself.
        if (channel === IPC_CHANNELS.WELCOME_CHAT_PROFILES) {
          return pathname === "/desktop/welcome";
        }
        if (
          channel === IPC_CHANNELS.DOCUMENT_READ ||
          channel === IPC_CHANNELS.DOCUMENT_WRITE
        ) {
          return pathname === "/desktop/file";
        }
        if (channel.startsWith("grida:native-chat:")) {
          return (
            pathname === "/desktop/workspace" ||
            (pathname === "/desktop/file" &&
              channel !== IPC_CHANNELS.NATIVE_CHAT_EDITOR_SURFACE_OPEN &&
              (!(selectedDocument || nestedDeck) ||
                !PROJECT_CONFIGURATION_CHANNELS.has(channel)))
          );
        }
        if (
          channel.startsWith("grida:native-external:") ||
          channel === IPC_CHANNELS.WORKSPACE_PUBLISH_EDITOR_SURFACES
        ) {
          return pathname === "/desktop/workspace";
        }
        return true;
      case "sign-in":
        return (
          pathname === "/desktop/auth/sign-in" && SIGN_IN_CHANNELS.has(channel)
        );
      case "onboarding":
        return (
          pathname === "/desktop/onboarding" && ONBOARDING_CHANNELS.has(channel)
        );
    }
  }
}
