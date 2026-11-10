/**
 * Click-to-attend arrival channel (RFC `docs/wg/ai/agent/events.md`
 * §click-to-attend) — a desktop notification click focused this window
 * and names the agent session to bring into view.
 *
 * The Electron main process pushes `AGENT_FOCUS_SESSION` over IPC; the
 * preload re-dispatches it as a window `CustomEvent` (only the
 * structured-clone payload crosses the bridge, mirroring the
 * workspace-command channel). This module owns the renderer half: the
 * event-name constant (must match the desktop shell's IPC channel id)
 * and a thin edge-wire hook (per `code-react`) the agent pane mounts.
 */

import { useEffect, useRef } from "react";

/** Mirrors `IPC_CHANNELS.AGENT_FOCUS_SESSION` in the desktop shell. */
export const DESKTOP_AGENT_FOCUS_SESSION_EVENT = "grida:agent:focus-session";

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
      const detail = (event as CustomEvent<unknown>).detail as
        | { session_id?: unknown; profile_id?: unknown }
        | undefined;
      const id = detail?.session_id;
      const profile = detail?.profile_id;
      if (typeof id !== "string" || id.length === 0) return;
      if (
        profile !== undefined &&
        (typeof profile !== "string" || !/^[a-f0-9]{64}$/.test(profile))
      )
        return;
      callbackRef.current(id, profile);
    };
    window.addEventListener(DESKTOP_AGENT_FOCUS_SESSION_EVENT, handler);
    return () => {
      window.removeEventListener(DESKTOP_AGENT_FOCUS_SESSION_EVENT, handler);
    };
  }, []);
}
