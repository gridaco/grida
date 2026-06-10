/**
 * Desktop notifications for agent lifecycle events — the first consumer
 * of the host-wide event channel (RFC `docs/wg/ai/agent/events.md`
 * §the first consumer).
 *
 * Main-process owned, deliberately NOT renderer-driven: a turn can
 * finish (a queue drain) or block on an approval with no renderer
 * attached to the session at all — its window closed, the user
 * elsewhere. Main tails the agent sidecar's `GET /events` SSE (the same
 * authed loopback client the open-file flow uses), applies the
 * notification policy, and shows native `Notification`s.
 *
 * The PURE policy (which events notify, the copy, the focus gate) lives
 * in `agent-notifications-policy.ts`, unit-tested headless. This module
 * is the wiring: a resilient subscription loop (the agent sidecar
 * restarts under supervisor backoff; the SSE drops and must re-attach),
 * session enrichment, window resolution, and click-to-attend.
 *
 * Click-to-attend (RFC `events` §click-to-attend): focus the workspace
 * window presenting the session; reopen it when closed (the fresh
 * window carries `&session=` on the URL — no IPC race against a
 * renderer with no listener yet); for a live window additionally push
 * AGENT_FOCUS_SESSION over IPC so the agent pane selects the session.
 * An unbound session (no workspace) falls back to the app's frontmost
 * window.
 */

import { app, BrowserWindow, Notification } from "electron";
import type { AgentLifecycleEvent, ChatSessionRow } from "@grida/agent";
import { agentSidecarClient } from "./agent-sidecar-client";
import { agent_notifications } from "./agent-notifications-policy";
import { findWindowByUrl } from "./window-focus";
import { IPC_CHANNELS } from "../bridge/contract";
import { open_welcome_window, open_workspace_window } from "../window";
import { EDITOR_BASE_URL } from "../env";

const RETRY_INITIAL_MS = 1_000;
const RETRY_MAX_MS = 10_000;

/** URL needle identifying the workspace window — the same per-workspace
 *  dedup needle the menu/open flow uses with `focusWindowByUrl`. */
function workspaceNeedle(workspaceId: string): string {
  return `/desktop/workspace?id=${encodeURIComponent(workspaceId)}`;
}

function resolveSessionWindow(
  session: ChatSessionRow | null
): BrowserWindow | null {
  if (!session?.workspace_id) return null;
  return findWindowByUrl(workspaceNeedle(session.workspace_id));
}

/**
 * Bring the user to the session (RFC `events` §click-to-attend).
 * Re-resolves the window at click time — it may have opened or closed
 * since the notification was shown.
 */
function attendSession(sessionId: string, session: ChatSessionRow | null) {
  // The app is in the background by construction (the focus gate suppressed
  // the focused case), and on macOS `BrowserWindow.focus()` alone does not
  // bring a background app forward. macOS usually activates the app on a
  // notification click, but not every path does (and Windows/Linux differ)
  // — steal explicitly so the click always lands the user in the app.
  app.focus({ steal: true });
  const target = resolveSessionWindow(session);
  if (target) {
    if (target.isMinimized()) target.restore();
    target.focus();
    target.webContents.send(IPC_CHANNELS.AGENT_FOCUS_SESSION, {
      session_id: sessionId,
    });
    return;
  }
  if (session?.workspace_id) {
    open_workspace_window({
      app,
      base_url: EDITOR_BASE_URL,
      workspace_id: session.workspace_id,
      session_id: sessionId,
    });
    return;
  }
  // Unbound session: the host's default surface — frontmost window, or a
  // fresh welcome window when none is open.
  const existing = BrowserWindow.getAllWindows()[0];
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return;
  }
  open_welcome_window({ app, base_url: EDITOR_BASE_URL });
}

async function handleEvent(event: AgentLifecycleEvent): Promise<void> {
  // Cheap pre-filter before the session read: only attention moments.
  if (event.type === "turn-started") return;
  if (
    event.type === "turn-finished" &&
    (event.reason === "abort" || event.pending_approval)
  ) {
    return;
  }

  // Enrich from the authoritative session row (title for the copy,
  // workspace binding for the focus gate + click routing). A failed read
  // degrades to the app-focus gate and fallback copy, never a drop.
  let session: ChatSessionRow | null = null;
  try {
    session = await agentSidecarClient.getSession(event.session_id);
  } catch {
    session = null;
  }
  const facts = session
    ? { title: session.title, workspace_id: session.workspace_id }
    : null;

  const target = resolveSessionWindow(session);
  const suppressed = agent_notifications.suppressed(facts, {
    target_exists: target !== null,
    target_focused: target !== null && target.isFocused(),
    app_focused: BrowserWindow.getFocusedWindow() !== null,
  });
  if (suppressed) return;

  const decision = agent_notifications.decide(event, facts);
  if (!decision) return;
  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title: decision.title,
    body: decision.body,
  });
  notification.on("click", () => attendSession(event.session_id, session));
  notification.show();
}

/**
 * Start the resilient subscription loop. Call once after the agent
 * sidecar supervisor reports ready; stops itself on `before-quit`.
 *
 * The loop re-attaches with capped backoff whenever the SSE ends or the
 * sidecar is unreachable (supervisor restart window). Events lost while
 * detached are lost by design — the channel is volatile (RFC `events`
 * §semantics); nothing of record rides it.
 */
export function startAgentNotifications(): void {
  let stopped = false;
  const controller = new AbortController();
  app.on("before-quit", () => {
    stopped = true;
    controller.abort();
  });

  void (async () => {
    let retryMs = RETRY_INITIAL_MS;
    while (!stopped) {
      try {
        const { done } = await agentSidecarClient.subscribeEvents(
          (event) => {
            void handleEvent(event).catch((err) => {
              console.warn("[agent-notifications] handler error:", err);
            });
          },
          { signal: controller.signal }
        );
        retryMs = RETRY_INITIAL_MS; // attached — reset the backoff
        await done;
      } catch (err) {
        if (!stopped) {
          console.warn(
            "[agent-notifications] events subscription error:",
            err instanceof Error ? err.message : err
          );
        }
      }
      if (stopped) return;
      await new Promise((resolve) => setTimeout(resolve, retryMs));
      retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
    }
  })();
}
