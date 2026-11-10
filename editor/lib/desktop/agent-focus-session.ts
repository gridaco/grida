/**
 * Click-to-attend arrival channel (RFC `docs/wg/ai/agent/events.md`
 * §click-to-attend) — a desktop notification click focused this window
 * and names the agent session to bring into view.
 *
 * Legacy shells and panes use the focus push directly. A native pane can
 * take the latest pending click once after connecting, with later pushes
 * waking the same guarded read.
 */

import { useEffect, useRef } from "react";
import type {
  DesktopNativeChat,
  NativeChatNotificationFocus,
} from "@grida/desktop-bridge";

/** Mirrors `IPC_CHANNELS.AGENT_FOCUS_SESSION` in the desktop shell. */
export const DESKTOP_AGENT_FOCUS_SESSION_EVENT = "grida:agent:focus-session";

function pushedFocus(event: Event): NativeChatNotificationFocus | null {
  const detail = (event as CustomEvent<unknown>).detail as
    | { session_id?: unknown; profile_id?: unknown }
    | undefined;
  const id = detail?.session_id;
  const profile = detail?.profile_id;
  if (typeof id !== "string" || id.length === 0) return null;
  if (profile === undefined) return { sessionId: id };
  if (typeof profile !== "string" || !/^[a-f0-9]{64}$/.test(profile))
    return null;
  return { sessionId: id, profileId: profile };
}

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
  const take = bridge.takeNotificationFocus;
  const readLatest = async () => {
    // Let synchronous mount/cleanup probes finish before taking a click.
    await Promise.resolve();
    let latest: NativeChatNotificationFocus | undefined;
    while (active && requested && ownsWorkspace()) {
      requested = false;
      try {
        const target = await take?.();
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
  const handle = (event: Event) => {
    if (take) request();
    else if (ownsWorkspace()) {
      const target = pushedFocus(event);
      if (target) focus(target.sessionId, target.profileId);
    }
  };
  window.addEventListener(DESKTOP_AGENT_FOCUS_SESSION_EVENT, handle);
  if (take) request();
  return () => {
    active = false;
    window.removeEventListener(DESKTOP_AGENT_FOCUS_SESSION_EVENT, handle);
  };
}

/**
 * Subscribe to focus-session pushes for the lifetime of the component.
 * The callback is ref-held so a re-render never re-subscribes.
 */
export function useDesktopAgentFocusSession(
  onFocusSession: (sessionId: string, profileId?: string) => void
): void {
  const callbackRef = useRef(onFocusSession);
  callbackRef.current = onFocusSession;
  useEffect(() => {
    const handler = (event: Event) => {
      const target = pushedFocus(event);
      if (target) callbackRef.current(target.sessionId, target.profileId);
    };
    window.addEventListener(DESKTOP_AGENT_FOCUS_SESSION_EVENT, handler);
    return () => {
      window.removeEventListener(DESKTOP_AGENT_FOCUS_SESSION_EVENT, handler);
    };
  }, []);
}
