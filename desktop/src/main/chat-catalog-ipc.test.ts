import { EventEmitter } from "node:events";
import type { IpcMainInvokeEvent } from "electron";
import { expect, it, vi } from "vitest";
import { listDesktopChats } from "./chat-catalog-ipc";

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
