/**
 * Click-to-attend arrival channel (RFC `docs/wg/ai/agent/events.md`
 * §click-to-attend) — a desktop notification click focused this window
 * and names the agent session to bring into view.
 *
 * The native pane takes the latest pending click once after connecting; later
 * pushes only wake the same guarded read.
 */

import type {
  DesktopNativeChat,
  NativeChatNotificationFocus,
} from "@grida/desktop-bridge";

/** Mirrors `IPC_CHANNELS.AGENT_FOCUS_SESSION` in the desktop shell. */
export const DESKTOP_AGENT_FOCUS_SESSION_EVENT = "grida:agent:focus-session";

export function subscribeToNativeNotificationFocus(
  bridge: Pick<DesktopNativeChat, "takeNotificationFocus">,
  workspaceId: string,
  focus: (sessionId: string, profileId?: string) => void
): () => void {
  let active = true;
  let requested = false;
  let reading = false;
  const ownsWorkspace = () => {
    const { pathname, search } = window.location;
    const [id, duplicate] = new URLSearchParams(search).getAll("id");
    return (
      pathname === "/desktop/workspace" &&
      id === workspaceId &&
      duplicate === undefined
    );
  };
  const readLatest = async () => {
    // Let synchronous mount/cleanup probes finish before taking a click.
    await Promise.resolve();
    let latest: NativeChatNotificationFocus | undefined;
    while (active && requested && ownsWorkspace()) {
      requested = false;
      try {
        const target = await bridge.takeNotificationFocus();
        if (target) latest = target;
      } catch {
        // The host can withdraw admission while the workbench disconnects.
        latest = undefined;
      }
    }
    reading = false;
    if (active && latest && ownsWorkspace())
      focus(latest.sessionId, latest.profileId);
  };
  const request = () => {
    requested = true;
    if (reading) return;
    reading = true;
    void readLatest();
  };
  window.addEventListener(DESKTOP_AGENT_FOCUS_SESSION_EVENT, request);
  request();
  return () => {
    active = false;
    window.removeEventListener(DESKTOP_AGENT_FOCUS_SESSION_EVENT, request);
  };
}
