import { afterEach, expect, it, vi } from "vitest";
import type { DesktopBridge } from "@grida/desktop-bridge";
import { IPC_CHANNELS } from "./bridge/contract";

const ipc = vi.hoisted(() => ({
  expose: vi.fn<(name: string, bridge: DesktopBridge) => void>(),
  invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: ipc.expose },
  ipcRenderer: {
    on: vi.fn<() => void>(),
    removeListener: vi.fn<() => void>(),
    invoke: ipc.invoke,
  },
}));
afterEach(() => vi.unstubAllGlobals());

it("follows same-document navigation for catalog updates and read actions", async () => {
  const location = new URL("https://example.test/desktop/welcome");
  const history = {
    pushState(_data: unknown, _unused: string, path: string) {
      location.href = new URL(path, location).href;
    },
    replaceState: vi.fn<() => void>(),
  };
  vi.stubGlobal("location", location);
  vi.stubGlobal("window", {
    location,
    history,
    addEventListener: vi.fn<() => void>(),
  });
  ipc.invoke.mockResolvedValue(true);
  await import("./preload");
  const chat = ipc.expose.mock.calls[0][1].nativeChat!;
  const canRead = chat.canSetReadState!;
  const observe = chat.observeCatalog!;
  const setRead = chat.setReadState!;
  expect(canRead()).toBe(false);
  expect(await observe(vi.fn<() => void>())).toBeNull();

  const id = "0123456789abcdef";
  history.pushState(null, "", `/desktop/workspace?id=${id}`);
  expect(canRead()).toBe(true);
  const stop = await observe(vi.fn<() => void>());
  expect(ipc.invoke).toHaveBeenCalledWith(
    IPC_CHANNELS.CHAT_CATALOG_OBSERVE,
    expect.any(String),
    { workspaceId: id }
  );
  await setRead("chat", { kind: "markUnread" });
  expect(ipc.invoke).toHaveBeenCalledWith(
    IPC_CHANNELS.CHAT_CATALOG_READ,
    "chat",
    { kind: "markUnread" }
  );
  stop!();
  history.pushState(null, "", `/desktop/file?id=${id}`);
  expect(canRead()).toBe(false);
  expect(await observe(vi.fn<() => void>())).toBeNull();
  ipc.invoke.mockClear();
  await expect(setRead("chat", { kind: "markUnread" })).rejects.toThrow(
    "chat_catalog_unavailable"
  );
  expect(ipc.invoke).not.toHaveBeenCalled();
});
