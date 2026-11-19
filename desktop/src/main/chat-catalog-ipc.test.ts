import { EventEmitter } from "node:events";
import type { IpcMainInvokeEvent } from "electron";
import { expect, it, vi } from "vitest";
import { DesktopChatCatalogIpc, listDesktopChats } from "./chat-catalog-ipc";

type ListChats = NonNullable<Parameters<typeof listDesktopChats>[2]>["list"];

function workspaceEvent() {
  const frame = {
    url: "https://example.test/desktop/workspace?id=abcd1234abcd1234",
  };
  const sender = Object.assign(new EventEmitter(), {
    mainFrame: frame,
    isDestroyed: () => false,
    isLoadingMainFrame: () => false,
  });
  return {
    sender,
    event: { sender, senderFrame: frame } as unknown as IpcMainInvokeEvent,
  };
}

it("accepts a registry filter or a global read and refuses paths and unbounded requests", async () => {
  const { event } = workspaceEvent();
  const page = { entries: [], nextCursor: null };
  const list = vi.fn<ListChats>().mockResolvedValue(page);
  const read = (query?: unknown) =>
    listDesktopChats(event, query, { list }, () => true);
  await expect(read()).resolves.toEqual(page);
  const query = { workspaceId: "abcd1234abcd1234", limit: 8 };
  await expect(read(query)).resolves.toEqual(page);
  expect(list).toHaveBeenLastCalledWith(
    expect.objectContaining(query),
    expect.any(Function)
  );
  for (const invalid of [
    { cwd: "/elsewhere" },
    { workspaceId: "/elsewhere" },
    { limit: 33 },
    { cursor: {} },
  ])
    await expect(read(invalid)).rejects.toThrow("chat_catalog_query_invalid");
  expect(list).toHaveBeenCalledTimes(2);
});

it("withdraws catalog metadata if the requesting document navigates during the read", async () => {
  const { event, sender } = workspaceEvent();
  const list = vi.fn<ListChats>(async () => {
    sender.emit("did-start-navigation", { isMainFrame: true });
    return { entries: [], nextCursor: null };
  });
  await expect(
    listDesktopChats(event, {}, { list }, () => true)
  ).rejects.toThrow("chat_catalog_unavailable");
  expect(sender.listenerCount("did-start-navigation")).toBe(0);
});

it("preserves an expired cursor diagnostic and keeps private store paths in Main", async () => {
  const { event } = workspaceEvent();
  const list = vi.fn<ListChats>();
  list
    .mockRejectedValueOnce(new Error("native_chat_catalog_cursor_invalid"))
    .mockRejectedValueOnce(
      new Error("failed to open /private/workspace/agent.sqlite")
    );
  const read = () => listDesktopChats(event, {}, { list }, () => true);
  await expect(read()).rejects.toThrow(/^native_chat_catalog_cursor_invalid$/);
  await expect(read()).rejects.toThrow(/^chat_catalog_unavailable$/);
});

it("releases a pending native subscription if the workbench navigates before registration completes", async () => {
  const { event, sender } = workspaceEvent();
  const pending = Promise.withResolvers<() => void>();
  const stop = vi.fn<() => void>();
  const observe = vi.fn<() => Promise<() => void>>(() => pending.promise);
  const catalog = { live: { observe } } as unknown as ConstructorParameters<
    typeof DesktopChatCatalogIpc
  >[0];
  const ipc = new DesktopChatCatalogIpc(catalog, () => true);
  const registration = ipc.observe(
    event,
    "12345678-0000-4000-8000-0123456789ab",
    {}
  );
  sender.emit("did-start-navigation", { isMainFrame: true });
  pending.resolve(stop);
  await expect(registration).rejects.toThrow("chat_catalog_unavailable");
  expect(stop).toHaveBeenCalledOnce();
  expect(sender.listenerCount("did-start-navigation")).toBe(0);
});

it("derives write scope from the focused workbench route and rejects renderer-supplied paths", async () => {
  const { event } = workspaceEvent();
  const setReadState = vi
    .fn<
      (
        workspace: string,
        session: string,
        change: unknown,
        check: () => void
      ) => Promise<void>
    >()
    .mockResolvedValue(undefined);
  const catalog = {
    live: { setReadState },
  } as unknown as ConstructorParameters<typeof DesktopChatCatalogIpc>[0];
  const ipc = new DesktopChatCatalogIpc(catalog, () => true);
  await ipc.read(event, "chat", { kind: "markUnread" });
  expect(setReadState).toHaveBeenCalledWith(
    "abcd1234abcd1234",
    "chat",
    { kind: "markUnread" },
    expect.any(Function)
  );
  await expect(
    ipc.read(event, "chat", { kind: "markUnread", cwd: "/tmp" })
  ).rejects.toThrow("chat_catalog_query_invalid");
  await expect(
    ipc.read(event, "chat", { kind: "acknowledge", revision: 5 })
  ).rejects.toThrow("chat_catalog_query_invalid");
  expect(setReadState).toHaveBeenCalledOnce();
});
