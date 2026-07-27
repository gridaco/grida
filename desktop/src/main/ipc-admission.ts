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
  }: {
    role: DesktopIpcRole;
    channel: IpcChannel;
    pathname: string;
  }): boolean {
    switch (role) {
      case "main":
        // A renderer may commit a contained auth/onboarding navigation before
        // Electron's navigation observer runs. Path admission closes that gap
        // without letting URL state grant a role.
        return (
          pathname !== "/desktop/onboarding" &&
          pathname !== "/desktop/auth" &&
          !pathname.startsWith("/desktop/auth/")
        );
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
