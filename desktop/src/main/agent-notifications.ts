/**
 * GRIDA-SEC-004 — route attention within the current authorized workspace.
 *
 * Main-process notifications for native workspace chat lifecycle facts.
 *
 * Main-process owned, deliberately NOT renderer-driven: a turn can
 * finish (a queue drain) or block on an approval with no renderer
 * attached to the chat at all. The native worker reports each fact for a
 * verified, current workspace; this module applies the focus gate and the
 * attention policy and shows native `Notification`s.
 *
 * The PURE policy (which facts notify, the copy) lives in
 * `agent-notifications-policy.ts`, unit-tested headless. This module is
 * the wiring: window resolution and click-to-attend.
 *
 * Click-to-attend (RFC `events` §click-to-attend): focus the workspace
 * window presenting the chat; reopen it when closed (the fresh window
 * carries `&session=` on the URL — no IPC race against a renderer with no
 * listener yet); for a live window additionally push AGENT_FOCUS_SESSION
 * over IPC so the agent pane selects the chat.
 */

import {
  app,
  BrowserWindow,
  Notification,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import type { NativeChatNotificationFocus } from "@grida/desktop-bridge";
import { agent_notifications } from "./agent-notifications-policy";
import { IPC_CHANNELS } from "../bridge/contract";
import { open_workspace_window } from "../window";
import { EDITOR_BASE_URL } from "../env";
import type { NativeChatLifecycle } from "./native-agent-chat";

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

function resolveWorkspaceWindow(
  workspaceId: string,
  navigation: AgentNotificationNavigation
): BrowserWindow | null {
  return (
    BrowserWindow.getAllWindows().find((window) => {
      return (
        !window.isDestroyed() &&
        navigation.admits(window) &&
        workspaceFor(window.webContents.getURL()) === workspaceId
      );
    }) ?? null
  );
}

type AgentNotificationNavigation = {
  can_open: () => boolean;
  admits: (window: BrowserWindow) => boolean;
  register: (window: BrowserWindow) => boolean;
  focus_entry: () => void;
};

/**
 * Bring the user to the chat (RFC `events` §click-to-attend).
 * Re-resolves the window at click time — it may have opened or closed
 * since the notification was shown.
 */
function attendSession(
  sessionId: string,
  workspaceId: string,
  navigation: AgentNotificationNavigation,
  current: () => boolean,
  profileId?: string
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
  const target = resolveWorkspaceWindow(workspaceId, navigation);
  if (target) {
    if (target.isMinimized()) target.restore();
    target.focus();
    const intent = { sessionId, ...(profileId && { profileId }) };
    const admitted = () =>
      !target.isDestroyed() &&
      navigation.can_open() &&
      navigation.admits(target) &&
      workspaceFor(target.webContents.getURL()) === workspaceId;
    if (!admitted() || !current()) return;
    stageFocus(
      target.webContents,
      workspaceId,
      intent,
      () => admitted() && current()
    );
    wakeFocus(target.webContents, workspaceId, intent);
    return;
  }
  const window = open_workspace_window({
    app,
    base_url: EDITOR_BASE_URL,
    workspace_id: workspaceId,
    session_id: sessionId,
    ...(profileId && { profile_id: profileId }),
  });
  navigation.register(window);
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
  // The focus gate: a focused window already shows this workspace.
  if (resolveWorkspaceWindow(workspaceId, navigation)?.isFocused()) return;
  const decision = agent_notifications.decideNative(event);
  if (decision)
    showNotification(decision, () => {
      if (current())
        attendSession(
          event.sessionId,
          workspaceId,
          navigation,
          current,
          profileId
        );
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
