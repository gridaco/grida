// GRIDA-SEC-004 / GRIDA-SEC-005 — Settings-only catalog requests.
import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { IpcMainInvokeEvent } from "electron";
import type { NativeArchives } from "./native-archives";
import { NativeArchiveIpc } from "./native-archive-ipc";

function fixture(path = "/desktop/settings", admitNavigation = false) {
  const frame = { url: `https://fixture.invalid${path}` };
  const event = {
    senderFrame: frame,
    sender: Object.assign(new EventEmitter(), {
      mainFrame: frame,
      isDestroyed: () => false,
      isLoadingMainFrame: () => false,
    }),
  };
  const list = vi
    .fn<() => Promise<unknown>>()
    .mockResolvedValue({ entries: [], nextCursor: null });
  const checkWorkspace = vi.fn<() => Promise<void>>().mockResolvedValue();
  const unarchive = vi.fn<NativeArchives["unarchive"]>().mockResolvedValue({
    workspaceId: "registered-workspace",
    sessionId: "restored-chat",
    checkWorkspace,
  });
  const openChat = vi
    .fn<(workspaceId: string, sessionId: string) => boolean>()
    .mockReturnValue(true);
  let admitted = true;
  const owner = new NativeArchiveIpc(
    { list, unarchive } as unknown as NativeArchives,
    () => admitted,
    admitNavigation ? openChat : undefined
  );
  return {
    owner,
    list,
    unarchive,
    checkWorkspace,
    openChat,
    sender: event.sender,
    frame,
    event: event as unknown as IpcMainInvokeEvent,
    revoke: () => {
      admitted = false;
    },
  };
}

describe("archive IPC", () => {
  it("allows admitted Settings without accepting native paths", async () => {
    const { owner, list, unarchive, event } = fixture();
    await owner.list(event, null);
    await owner.unarchive(event, "opaque-handle", 4);
    expect(list).toHaveBeenCalledWith(null, expect.any(Function));
    expect(unarchive).toHaveBeenCalledWith(
      "opaque-handle",
      4,
      expect.any(Function)
    );
    await expect(owner.unarchive(event, {}, 4)).rejects.toThrow(
      "handle_invalid"
    );
    await expect(owner.list(event, {})).rejects.toThrow("cursor_invalid");
  });

  it.each([
    "/desktop/workspace?id=x",
    "/desktop/auth/sign-in",
    "/desktop/onboarding",
  ])("rejects non-Settings callers (%s)", async (path) => {
    const { owner, event, list } = fixture(path);
    await expect(owner.list(event)).rejects.toThrow("settings_required");
    expect(list).not.toHaveBeenCalled();
  });

  it("rejects subframes and revoked admission, and revalidates after a read", async () => {
    const { owner, event, list, frame, revoke } = fixture();
    Object.defineProperty(event, "senderFrame", {
      value: { url: frame.url },
      configurable: true,
    });
    await expect(owner.list(event)).rejects.toThrow("settings_required");
    Object.defineProperty(event, "senderFrame", { value: frame });
    list.mockImplementationOnce(async () => {
      revoke();
      return {};
    });
    await expect(owner.list(event)).rejects.toThrow("settings_required");
  });

  it("opens only the exact chat restored by the same Settings document", async () => {
    const { owner, event, frame, sender, checkWorkspace, openChat } = fixture(
      "/desktop/settings#archived-chats",
      true
    );
    const other = fixture();
    await expect(owner.openRestored(event, "opaque")).rejects.toThrow(
      "restored_chat_unavailable"
    );
    await expect(owner.unarchive(event, "opaque", 4)).resolves.toBeUndefined();
    await expect(owner.openRestored(other.event, "opaque")).rejects.toThrow(
      "restored_chat_unavailable"
    );
    const next = "https://fixture.invalid/desktop/settings#appearance";
    sender.emit("did-start-navigation", {
      isMainFrame: true,
      isSameDocument: true,
      url: next,
    });
    frame.url = next;
    sender.emit("did-navigate-in-page", {}, next, true);
    await owner.openRestored(event, "opaque");
    expect(checkWorkspace).toHaveBeenCalledOnce();
    expect(openChat).toHaveBeenCalledExactlyOnceWith(
      "registered-workspace",
      "restored-chat"
    );
    await expect(owner.openRestored(event, "opaque")).rejects.toThrow(
      "restored_chat_unavailable"
    );
  });

  it("refuses failed restores, changed workspaces and replacing the Settings document", async () => {
    const { owner, event, unarchive, sender, checkWorkspace, openChat } =
      fixture("/desktop/settings", true);
    unarchive.mockRejectedValueOnce(new Error("revision_changed"));
    await expect(owner.unarchive(event, "failed", 4)).rejects.toThrow(
      "revision_changed"
    );
    await expect(owner.openRestored(event, "failed")).rejects.toThrow(
      "restored_chat_unavailable"
    );
    await owner.unarchive(event, "workspace-changed", 4);
    checkWorkspace.mockRejectedValueOnce(new Error("unavailable"));
    await expect(
      owner.openRestored(event, "workspace-changed")
    ).rejects.toThrow("archive_workspace_changed");
    await owner.unarchive(event, "previous-document", 4);
    checkWorkspace.mockImplementationOnce(async () => {
      sender.emit("did-navigate");
    });
    await expect(
      owner.openRestored(event, "previous-document")
    ).rejects.toThrow("restored_chat_unavailable");
    expect(openChat).not.toHaveBeenCalled();
  });
});
