import { beforeEach, expect, it, vi } from "vitest";
import type { NativeChatLifecycle } from "./native-agent-chat";
import { notifyNativeChat } from "./agent-notifications";

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
vi.mock("./agent-sidecar-client", () => ({ agentSidecarClient: {} }));
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
    register: vi.fn<(window: unknown) => boolean>(() => true),
    focus_entry: vi.fn<() => void>(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  host.windows.mockReturnValue([]);
  host.click = undefined;
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

it("suppresses watched work and user cancellation, and sends only the chat ID when clicked", () => {
  const nav = navigation();
  const send = vi.fn<(channel: string, payload: unknown) => void>();
  let focused = true;
  host.windows.mockReturnValue([
    {
      isDestroyed: () => false,
      isFocused: () => focused,
      isMinimized: () => false,
      focus: vi.fn<() => void>(),
      webContents: {
        getURL: () =>
          `https://editor.fixture.invalid/desktop/workspace?id=${workspaceId}`,
        send,
      },
    },
  ]);
  notifyNativeChat(workspaceId, event, nav, () => true);
  focused = false;
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
  expect(send).toHaveBeenCalledExactlyOnceWith("grida:agent:focus-session", {
    session_id: event.sessionId,
  });
  expect(host.open).not.toHaveBeenCalled();
});
