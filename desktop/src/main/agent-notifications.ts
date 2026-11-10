/**
 * GRIDA-SEC-004 — route attention within the current authorized workspace.
 *
 * Main-process notifications for agent lifecycle events.
 *
 * Main-process owned, deliberately NOT renderer-driven: a turn can
 * finish (a queue drain) or block on an approval with no renderer
 * attached to the session at all. Main consumes native workspace
 * lifecycle facts or, for the legacy runtime, the sidecar's authenticated
 * `GET /events` stream. It applies the attention policy and shows native
 * `Notification`s.
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

import {
  app,
  BrowserWindow,
  Notification,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import type { AgentLifecycleEvent, ChatSessionRow } from "@grida/agent";
import type { NativeChatNotificationFocus } from "@grida/desktop-bridge";
import { agentSidecarClient } from "./agent-sidecar-client";
import { agent_notifications } from "./agent-notifications-policy";
import { IPC_CHANNELS } from "../bridge/contract";
import { open_workspace_window } from "../window";
import { EDITOR_BASE_URL } from "../env";
import type { NativeChatLifecycle } from "./native-agent-chat";

const RETRY_INITIAL_MS = 1_000;
const RETRY_MAX_MS = 10_000;
const EDITOR_ORIGIN = new URL(EDITOR_BASE_URL).origin;

type PendingFocus = Readonly<{
  workspaceId: string;
  intent: NativeChatNotificationFocus;
  current: () => boolean;
  release: () => void;
}>;
const pendingFocus = new WeakMap<WebContents, PendingFocus>();

function workspaceFor(raw: string): string | undefined {
  const url = URL.parse(raw);
  if (url?.origin !== EDITOR_ORIGIN || url.pathname !== "/desktop/workspace")
    return;
  const [id, duplicate] = url.searchParams.getAll("id");
  return id && duplicate === undefined ? id : undefined;
}

function liveMainFrame(sender: WebContents) {
  if (sender.isDestroyed() || sender.isLoadingMainFrame()) return;
  const frame = sender.mainFrame;
  if (!frame.isDestroyed() && !frame.detached) return frame;
}

function wakeFocus(
  sender: WebContents,
  workspaceId: string,
  { sessionId, profileId }: NativeChatNotificationFocus
): void {
  const frame = liveMainFrame(sender);
  if (!frame || workspaceFor(frame.url) !== workspaceId) return;
  try {
    frame.send(IPC_CHANNELS.AGENT_FOCUS_SESSION, {
      session_id: sessionId,
      ...(profileId && { profile_id: profileId }),
    });
  } catch {
    // A navigation may replace the frame before the wake reaches it.
  }
}

function stageFocus(
  sender: WebContents,
  workspaceId: string,
  intent: NativeChatNotificationFocus,
  current: () => boolean
): void {
  pendingFocus.get(sender)?.release();
  const release = () => {
    if (pendingFocus.get(sender) === entry) pendingFocus.delete(sender);
    sender.off("did-start-navigation", starting);
    sender.off("did-navigate", navigated);
    sender.off("did-navigate-in-page", inPage);
    sender.off("render-process-gone", release);
    sender.off("destroyed", release);
  };
  const starting = ({
    isMainFrame,
    url,
  }: {
    isMainFrame: boolean;
    url: string;
  }) => {
    if (isMainFrame && workspaceFor(url) !== workspaceId) release();
  };
  const navigated = (_event: unknown, url: string) => {
    if (workspaceFor(url) !== workspaceId) release();
  };
  const inPage = (event: unknown, url: string, isMainFrame: boolean) => {
    if (isMainFrame) navigated(event, url);
  };
  const entry = { workspaceId, intent, current, release };
  pendingFocus.set(sender, entry);
  sender.on("did-start-navigation", starting);
  sender.on("did-navigate", navigated);
  sender.on("did-navigate-in-page", inPage);
  sender.once("render-process-gone", release);
  sender.once("destroyed", release);
}

/** The invoke's window role and URL are checked before the mailbox is read. */
export function takeNativeNotificationFocus({
  sender,
  senderFrame,
}: Pick<
  IpcMainInvokeEvent,
  "sender" | "senderFrame"
>): NativeChatNotificationFocus | null {
  const entry = pendingFocus.get(sender);
  if (!entry || !senderFrame || senderFrame !== liveMainFrame(sender))
    return null;
  const intent =
    workspaceFor(senderFrame.url) === entry.workspaceId && entry.current()
      ? entry.intent
      : null;
  entry.release();
  return intent;
}

function resolveSessionWindow(
  session: agent_notifications.SessionFacts | null,
  navigation: AgentNotificationNavigation
): BrowserWindow | null {
  if (!session?.workspace_id) return null;
  return (
    BrowserWindow.getAllWindows().find((window) => {
      return (
        !window.isDestroyed() &&
        navigation.admits(window) &&
        workspaceFor(window.webContents.getURL()) === session.workspace_id
      );
    }) ?? null
  );
}

/**
 * Bring the user to the session (RFC `events` §click-to-attend).
 * Re-resolves the window at click time — it may have opened or closed
 * since the notification was shown.
 */
type AgentNotificationNavigation = {
  can_open: () => boolean;
  admits: (window: BrowserWindow) => boolean;
  register: (window: BrowserWindow) => boolean;
  focus_entry: () => void;
};

function attendSession(
  sessionId: string,
  session: agent_notifications.SessionFacts | null,
  navigation: AgentNotificationNavigation,
  profileId?: string,
  current?: () => boolean
) {
  if (!navigation.can_open()) {
    navigation.focus_entry();
    return;
  }
  // The app is in the background by construction (the focus gate suppressed
  // the focused case), and on macOS `BrowserWindow.focus()` alone does not
  // bring a background app forward. macOS usually activates the app on a
  // notification click, but not every path does (and Windows/Linux differ)
  // — steal explicitly so the click always lands the user in the app.
  app.focus({ steal: true });
  const target = resolveSessionWindow(session, navigation);
  if (target && session?.workspace_id) {
    if (target.isMinimized()) target.restore();
    target.focus();
    const intent = { sessionId, ...(profileId && { profileId }) };
    const admitted = () =>
      !target.isDestroyed() &&
      navigation.can_open() &&
      navigation.admits(target) &&
      workspaceFor(target.webContents.getURL()) === session.workspace_id;
    if (!admitted()) return;
    if (current) {
      if (!current()) return;
      stageFocus(
        target.webContents,
        session.workspace_id,
        intent,
        () => admitted() && current()
      );
    }
    wakeFocus(target.webContents, session.workspace_id, intent);
    return;
  }
  if (session?.workspace_id) {
    const window = open_workspace_window({
      app,
      base_url: EDITOR_BASE_URL,
      workspace_id: session.workspace_id,
      session_id: sessionId,
      ...(profileId && { profile_id: profileId }),
    });
    navigation.register(window);
    return;
  }
  // Unbound session: return to the one controller-owned app entry instead of
  // guessing which arbitrary window is the front door.
  navigation.focus_entry();
}

async function handleEvent(
  event: AgentLifecycleEvent,
  navigation: AgentNotificationNavigation
): Promise<void> {
  if (!navigation.can_open()) return;
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
  // Session enrichment is asynchronous. Sign-out or onboarding may have
  // changed admission while it was in flight; suppress the stale notification.
  if (!navigation.can_open()) return;
  const facts = session
    ? { title: session.title, workspace_id: session.workspace_id }
    : null;

  const target = resolveSessionWindow(facts, navigation);
  const suppressed = agent_notifications.suppressed(facts, {
    target_exists: target !== null,
    target_focused: target !== null && target.isFocused(),
    app_focused: BrowserWindow.getFocusedWindow() !== null,
  });
  if (suppressed) return;

  const decision = agent_notifications.decide(event, facts);
  if (!decision) return;
  showNotification(decision, () =>
    attendSession(event.session_id, facts, navigation)
  );
}

/** Native attention is already attributed to a verified, current worker. */
export function notifyNativeChat(
  workspaceId: string,
  event: NativeChatLifecycle,
  navigation: AgentNotificationNavigation,
  current: () => boolean,
  profileId?: string
): void {
  if (!navigation.can_open() || !current()) return;
  const facts = { title: null, workspace_id: workspaceId };
  const target = resolveSessionWindow(facts, navigation);
  if (target?.isFocused()) return;
  const decision = agent_notifications.decideNative(event);
  if (decision)
    showNotification(decision, () => {
      if (current())
        attendSession(event.sessionId, facts, navigation, profileId, current);
    });
}

function showNotification(
  decision: agent_notifications.Decision,
  attend: () => void
): void {
  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title: decision.title,
    body: decision.body,
  });
  notification.on("click", attend);
  // macOS rejects notifications silently when the app's identity isn't
  // authorized (UNErrorDomain 1 — e.g. ad-hoc-signed dev builds, or the
  // user disabled the app in Notification Center). Without this listener
  // the whole pipeline looks healthy while nothing ever appears.
  notification.on("failed", (_event, error) => {
    console.warn(`[agent-notifications] OS rejected notification: ${error}`);
  });
  notification.on("show", () => {
    console.log(`[agent-notifications] shown: ${decision.title}`);
  });
  notification.show();
}

/**
 * Start the resilient subscription loop. Call once after the agent
 * sidecar supervisor reports ready; stops itself on `will-quit`.
 *
 * The loop re-attaches with capped backoff whenever the SSE ends or the
 * sidecar is unreachable (supervisor restart window). Events lost while
 * detached are lost by design — the channel is volatile (RFC `events`
 * §semantics); nothing of record rides it.
 */
export function startAgentNotifications(
  navigation: AgentNotificationNavigation
): void {
  let stopped = false;
  const controller = new AbortController();
  app.once("will-quit", () => {
    stopped = true;
    controller.abort();
  });

  void (async () => {
    let retryMs = RETRY_INITIAL_MS;
    while (!stopped) {
      try {
        const { done } = await agentSidecarClient.subscribeEvents(
          (event) => {
            void handleEvent(event, navigation).catch((err) => {
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
