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
 * listener yet); for a live window stage the target and push
 * AGENT_FOCUS_SESSION over IPC so the agent pane takes it.
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
import type {
  NativeChatCompletionPreview,
  NativeChatLifecycle,
  NativeChatSession,
} from "./native-agent-chat";

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

/** Wake the pane's guarded take; the staged intent is the only payload. */
function wakeFocus(sender: WebContents, workspaceId: string): void {
  const frame = liveMainFrame(sender);
  if (!frame || workspaceFor(frame.url) !== workspaceId) return;
  try {
    frame.send(IPC_CHANNELS.AGENT_FOCUS_SESSION);
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
  navigation: AgentNotificationNavigation,
  matches: (window: BrowserWindow) => boolean = () => true
): BrowserWindow | null {
  return (
    BrowserWindow.getAllWindows().find((window) => {
      return (
        !window.isDestroyed() &&
        navigation.admits(window) &&
        workspaceFor(window.webContents.getURL()) === workspaceId &&
        matches(window)
      );
    }) ?? null
  );
}

type AgentNotificationNavigation = {
  can_open: () => boolean;
  admits: (window: BrowserWindow) => boolean;
  register: (window: BrowserWindow) => boolean;
  focus_entry: () => void;
  questionPresentation?: (
    sender: WebContents,
    session: NativeChatSession
  ) => boolean | undefined;
};

/**
 * Bring the user to the chat (RFC `events` §click-to-attend).
 * Re-resolves the window at click time — it may have opened or closed
 * since the notification was shown.
 */
function attendSession(
  event: NativeChatLifecycle,
  workspaceId: string,
  navigation: AgentNotificationNavigation,
  current: () => boolean,
  profileId?: string
) {
  const question = event.kind === "question_asked" ? event : undefined;
  const owning =
    question &&
    ((window: BrowserWindow) =>
      navigation.questionPresentation?.(
        window.webContents,
        question.session
      ) !== undefined);
  focusNativeChat(
    workspaceId,
    {
      sessionId: event.sessionId,
      ...(profileId && { profileId }),
      ...(question?.side && { side: true as const }),
    },
    navigation,
    current,
    owning
  );
}

/** Open a Main-resolved chat target, reusing an admitted workspace window. */
export function focusNativeChat(
  workspaceId: string,
  intent: NativeChatNotificationFocus,
  navigation: AgentNotificationNavigation,
  current: () => boolean = () => true,
  owning?: (window: BrowserWindow) => boolean
): boolean {
  if (!navigation.can_open()) {
    navigation.focus_entry();
    return false;
  }
  if (!current()) return false;
  const target =
    (owning && resolveWorkspaceWindow(workspaceId, navigation, owning)) ??
    (intent.side ? null : resolveWorkspaceWindow(workspaceId, navigation));
  if (!target && intent.side) return false;
  // macOS can leave the app in the background after BrowserWindow.focus().
  app.focus({ steal: true });
  if (target) {
    if (target.isMinimized()) target.restore();
    target.focus();
    const admitted = () =>
      !target.isDestroyed() &&
      navigation.can_open() &&
      navigation.admits(target) &&
      workspaceFor(target.webContents.getURL()) === workspaceId &&
      (!intent.side || owning?.(target) === true);
    if (!admitted() || !current()) return false;
    stageFocus(
      target.webContents,
      workspaceId,
      intent,
      () => admitted() && current()
    );
    wakeFocus(target.webContents, workspaceId);
    return true;
  }
  const window = open_workspace_window({
    app,
    base_url: EDITOR_BASE_URL,
    workspace_id: workspaceId,
    session_id: intent.sessionId,
    ...(intent.profileId && { profile_id: intent.profileId }),
  });
  return navigation.register(window);
}

/** Native attention is already attributed to a verified, current worker. */
export async function notifyNativeChat(
  workspaceId: string,
  event: NativeChatLifecycle,
  navigation: AgentNotificationNavigation,
  current: () => boolean,
  profileId?: string
): Promise<void> {
  const mayNotify = () =>
    current() &&
    navigation.can_open() &&
    Notification.isSupported() &&
    shouldNotifyInBackground(workspaceId, event, navigation);
  if (!mayNotify()) return;
  let preview: NativeChatCompletionPreview | undefined;
  if (
    event.kind === "settled" &&
    event.status === "succeeded" &&
    event.readPreview
  ) {
    preview = await event.readPreview().catch(() => undefined);
    if (!mayNotify()) return;
  }
  const decision = agent_notifications.decideNative(event, preview);
  if (decision)
    showNotification(decision, () => {
      if (current())
        attendSession(event, workspaceId, navigation, current, profileId);
    });
}

function shouldNotifyInBackground(
  workspaceId: string,
  event: NativeChatLifecycle,
  navigation: AgentNotificationNavigation
): boolean {
  if (event.kind === "question_asked") {
    const presentation = (window: BrowserWindow) =>
      navigation.questionPresentation?.(window.webContents, event.session);
    if (
      event.side &&
      !resolveWorkspaceWindow(
        workspaceId,
        navigation,
        (w) => presentation(w) !== undefined
      )
    )
      return false;
    return !resolveWorkspaceWindow(
      workspaceId,
      navigation,
      (w) => w.isFocused() && presentation(w) === true
    );
  }
  return !resolveWorkspaceWindow(workspaceId, navigation, (w) => w.isFocused());
}

function showNotification(
  decision: agent_notifications.Decision,
  attend: () => void
): void {
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
  notification.show();
}
