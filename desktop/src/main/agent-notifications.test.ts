import { EventEmitter } from "node:events";
import type { IpcMainInvokeEvent } from "electron";
import { beforeEach, expect, it, vi } from "vitest";
import type { NativeChatLifecycle } from "./native-agent-chat";
import {
  notifyNativeChat,
  takeNativeNotificationFocus,
} from "./agent-notifications";

const host = vi.hoisted(() => ({
  focus: vi.fn<() => void>(),
  windows: vi.fn<() => unknown[]>(),
  open: vi.fn<(options: unknown) => unknown>(),
  shown: vi.fn<(options: unknown) => void>(),
  click: undefined as (() => void) | undefined,
}));

vi.mock("electron", () => ({
  app: { focus: host.focus },
  BrowserWindow: { getAllWindows: host.windows },
  Notification: class {
    static isSupported() {
      return true;
    }
    constructor(private readonly options: unknown) {}
    on(event: string, listener: () => void) {
      if (event === "click") host.click = listener;
    }
    show() {
      host.shown(this.options);
    }
  },
}));
vi.mock("../window", () => ({ open_workspace_window: host.open }));
vi.mock("../env", () => ({
  EDITOR_BASE_URL: "https://editor.fixture.invalid",
}));

const workspaceId = "eac20941e6a410aa";
const event: NativeChatLifecycle = {
  kind: "settled",
  status: "succeeded",
  sessionId: "saved-chat",
  turnId: "turn-1",
};

function navigation() {
  return {
    can_open: () => true,
    admits: vi.fn<() => boolean>(() => true),
    register: vi.fn<(window: unknown) => boolean>(() => true),
    focus_entry: vi.fn<() => void>(),
  };
}

function workspaceWindow() {
  const href = `https://editor.fixture.invalid/desktop/workspace?id=${workspaceId}`;
  const send = vi.fn<(channel: string, payload: unknown) => void>();
  const state = { url: href, loading: false, focused: false };
  const frame = {
    get url() {
      return state.url;
    },
    isDestroyed: () => false,
    detached: false,
    send,
  };
  const sender = Object.assign(new EventEmitter(), {
    getURL: () => state.url,
    isDestroyed: () => false,
    isLoadingMainFrame: () => state.loading,
    mainFrame: frame,
  });
  const window = {
    isDestroyed: () => false,
    isFocused: () => state.focused,
    isMinimized: () => false,
    focus: vi.fn<() => void>(),
    webContents: sender,
  };
  const take = (requestedFrame = frame) =>
    takeNativeNotificationFocus({
      sender,
      senderFrame: requestedFrame,
    } as unknown as IpcMainInvokeEvent);
  return { href, send, state, frame, sender, window, take };
}

beforeEach(() => {
  vi.clearAllMocks();
  host.windows.mockReturnValue([]);
  host.click = undefined;
});

it("keeps the saved model connection when reopening a workspace from a notification", () => {
  const nav = navigation();
  const profileId = "b".repeat(64);
  notifyNativeChat(workspaceId, event, nav, () => true, profileId);
  host.click!();
  expect(host.open).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      workspace_id: workspaceId,
      session_id: event.sessionId,
      profile_id: profileId,
    })
  );
});

it("opens the exact saved chat on notification click and withdraws a retired click", () => {
  const nav = navigation();
  const opened = {};
  host.open.mockReturnValue(opened);
  let current = true;
  notifyNativeChat(workspaceId, event, nav, () => current);
  expect(host.shown).toHaveBeenCalledExactlyOnceWith({
    title: "Grida Agent",
    body: "Turn completed",
  });
  const click = host.click!;
  click();
  expect(host.open).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      workspace_id: workspaceId,
      session_id: event.sessionId,
    })
  );
  expect(nav.register).toHaveBeenCalledExactlyOnceWith(opened);
  current = false;
  click();
  expect(host.open).toHaveBeenCalledTimes(1);
});

it("suppresses watched work and user cancellation, and only wakes the pane when clicked", () => {
  const nav = navigation();
  const target = workspaceWindow();
  const { send } = target;
  target.state.focused = true;
  host.windows.mockReturnValue([target.window]);
  notifyNativeChat(workspaceId, event, nav, () => true);
  target.state.focused = false;
  notifyNativeChat(
    workspaceId,
    { ...event, kind: "settled", status: "cancelled" },
    nav,
    () => true
  );
  expect(host.shown).not.toHaveBeenCalled();
  notifyNativeChat(
    workspaceId,
    {
      kind: "approval_required",
      sessionId: event.sessionId,
      turnId: event.turnId,
      waitId: "wait-1",
    },
    nav,
    () => true
  );
  expect(host.shown).toHaveBeenCalledExactlyOnceWith({
    title: "Grida Agent",
    body: "Waiting for your approval",
  });
  host.click!();
  expect(send).toHaveBeenCalledExactlyOnceWith("grida:agent:focus-session");
  expect(host.open).not.toHaveBeenCalled();
  const profileId = "d".repeat(64);
  notifyNativeChat(workspaceId, event, nav, () => true, profileId);
  host.click!();
  expect(send).toHaveBeenLastCalledWith("grida:agent:focus-session");
});

it("retains only the latest click through a same-workspace load and serves it once to the exact top frame", () => {
  const nav = navigation();
  const target = workspaceWindow();
  const profileId = "c".repeat(64);
  target.state.loading = true;
  host.windows.mockReturnValue([target.window]);
  notifyNativeChat(workspaceId, event, nav, () => true);
  host.click!();
  notifyNativeChat(
    workspaceId,
    { ...event, sessionId: "last-chat" },
    nav,
    () => true,
    profileId
  );
  host.click!();
  expect(target.take()).toBeNull();
  expect(target.send).not.toHaveBeenCalled();
  target.sender.emit("did-start-navigation", {
    isMainFrame: true,
    isSameDocument: false,
    url: target.href,
  });
  target.sender.emit("did-navigate", {}, target.href);
  target.state.loading = false;
  target.sender.emit("did-finish-load");
  expect(target.send).not.toHaveBeenCalled();
  expect(target.take({ ...target.frame })).toBeNull();
  expect(target.take()).toEqual({ sessionId: "last-chat", profileId });
  expect(target.take()).toBeNull();
});

it("withdraws pending focus after cross-workspace navigation, renderer loss or owner invalidation", () => {
  const nav = navigation();
  const target = workspaceWindow();
  host.windows.mockReturnValue([target.window]);
  let current = true;
  const stage = () => {
    notifyNativeChat(workspaceId, event, nav, () => current);
    host.click!();
  };
  stage();
  target.sender.emit("did-start-navigation", {
    isMainFrame: true,
    isSameDocument: true,
    url: target.href.replace(workspaceId, "other-workspace"),
  });
  expect(target.take()).toBeNull();
  stage();
  target.state.url = target.href.replace(workspaceId, "other-workspace");
  expect(target.take()).toBeNull();
  target.state.url = target.href;
  expect(target.take()).toBeNull();
  stage();
  target.sender.emit("render-process-gone");
  expect(target.take()).toBeNull();
  stage();
  current = false;
  expect(target.take()).toBeNull();
  current = true;
  stage();
  nav.admits.mockReturnValue(false);
  expect(target.take()).toBeNull();
  nav.admits.mockReturnValue(true);
  expect(target.take()).toBeNull();
});
