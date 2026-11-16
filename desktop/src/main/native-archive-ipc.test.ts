// GRIDA-SEC-004 / GRIDA-SEC-005 — Settings-only catalog requests.
import { describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import type { NativeArchives } from "./native-archives";
import { NativeArchiveIpc } from "./native-archive-ipc";

function fixture(path = "/desktop/settings") {
  const frame = { url: `https://fixture.invalid${path}` };
  const event = {
    senderFrame: frame,
    sender: {
      mainFrame: frame,
      isDestroyed: () => false,
      isLoadingMainFrame: () => false,
    },
  };
  const list = vi
    .fn<() => Promise<unknown>>()
    .mockResolvedValue({ entries: [], nextCursor: null });
  const unarchive = vi.fn<() => Promise<void>>().mockResolvedValue();
  let admitted = true;
  const owner = new NativeArchiveIpc(
    { list, unarchive } as unknown as NativeArchives,
    () => admitted
  );
  return {
    owner,
    list,
    unarchive,
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
});
