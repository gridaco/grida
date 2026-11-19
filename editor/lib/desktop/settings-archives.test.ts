import { describe, expect, it, vi } from "vitest";
import type {
  DesktopArchivedChat,
  DesktopArchivedChatPage,
  DesktopBridge,
} from "@grida/desktop-bridge";
import { SettingsArchives } from "./settings-archives";

type Native = NonNullable<DesktopBridge["archives"]>;
const first: DesktopArchivedChat = {
  id: "opaque-one",
  workspace: "Project A",
  title: "Earlier chat",
  revision: 3,
};
const second: DesktopArchivedChat = {
  id: "opaque-two",
  workspace: "Project B",
  title: "Another chat",
  revision: 5,
};
function native() {
  return {
    list: vi
      .fn<Native["list"]>()
      .mockResolvedValue({ entries: [first], nextCursor: null }),
    unarchive: vi.fn<Native["unarchive"]>().mockResolvedValue(),
  };
}

describe("SettingsArchives.Controller", () => {
  it("uses the metadata capability and removes a row only after successful unarchive", async () => {
    const api = native();
    const controller = new SettingsArchives.Controller(() => api);
    await controller.refresh();
    await expect(controller.unarchive(first.id)).resolves.toBe(true);
    expect(api.unarchive).toHaveBeenCalledExactlyOnceWith(
      first.id,
      first.revision
    );
    expect(controller.read().entries).toEqual([]);
  });
  it("preserves a row and its revision when unarchive fails", async () => {
    const api = native();
    api.unarchive.mockRejectedValue(new Error("revision conflict"));
    const controller = new SettingsArchives.Controller(() => api);
    await controller.refresh();
    await expect(controller.unarchive(first.id)).resolves.toBe(false);
    expect(controller.read().entries).toEqual([first]);
    expect(controller.read().restoring).toBeNull();
    expect(controller.read().error).toContain("Refresh the list");
  });
  it("appends pages without duplicating retained rows", async () => {
    const api = native();
    api.list
      .mockResolvedValueOnce({ entries: [first], nextCursor: "page-two" })
      .mockResolvedValueOnce({ entries: [first, second], nextCursor: null });
    const controller = new SettingsArchives.Controller(() => api);
    await controller.refresh();
    await controller.more();
    expect(api.list).toHaveBeenNthCalledWith(2, "page-two");
    expect(controller.read().entries).toEqual([first, second]);
    expect(controller.read().nextCursor).toBeNull();
  });
  it("preserves loaded metadata when refresh fails", async () => {
    const api = native();
    const controller = new SettingsArchives.Controller(() => api);
    await controller.refresh();
    api.list.mockRejectedValue(new Error("unavailable"));
    await controller.refresh();
    expect(controller.read().entries).toEqual([first]);
    expect(controller.read().loading).toBe(false);
    expect(controller.read().error).not.toBeNull();
  });

  it.each([
    "Error invoking remote method 'grida:archives:list': Error: No handler registered for 'grida:archives:list'",
    "Error invoking remote method 'grida:archives:list': Error: native_archive_unavailable",
    "Error invoking remote method 'grida:archives:list': Error: native_archive_settings_required",
  ])(
    "explains a missing native archive service instead of promising refresh (%s)",
    async (message) => {
      const api = native();
      api.list.mockRejectedValue(new Error(message));
      const controller = new SettingsArchives.Controller(() => api);
      await controller.refresh();
      expect(controller.read().error).toContain("Restart Desktop");
      expect(controller.read().error).not.toContain("Try refreshing the list");
      expect(controller.read().loading).toBe(false);
    }
  );

  it("does not expose arbitrary native error messages", async () => {
    const api = native();
    api.list.mockRejectedValue(new Error("private diagnostic /private/state"));
    const controller = new SettingsArchives.Controller(() => api);
    await controller.refresh();
    expect(controller.read().error).toBe(
      "Couldn't load archived chats. Try refreshing the list."
    );
  });

  it("retains unavailable workspace notices alongside partial metadata", async () => {
    const api = native();
    api.list
      .mockResolvedValueOnce({
        entries: [first],
        nextCursor: "page-two",
        unavailableWorkspaces: ["Project C"],
      })
      .mockResolvedValueOnce({
        entries: [second],
        nextCursor: null,
        unavailableWorkspaces: ["Project C", "Project D"],
      });
    const controller = new SettingsArchives.Controller(() => api);
    await controller.refresh();
    await controller.more();
    expect(controller.read().entries).toEqual([first, second]);
    expect(controller.read().unavailableWorkspaces).toEqual([
      "Project C",
      "Project D",
    ]);
    api.list.mockResolvedValue({ entries: [], nextCursor: null });
    await controller.refresh();
    expect(controller.read().unavailableWorkspaces).toEqual([]);
  });
  it("keeps the first read in flight while the archive tab resubscribes", async () => {
    let settle!: (value: DesktopArchivedChatPage) => void;
    const api = native();
    api.list.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      })
    );
    const controller = new SettingsArchives.Controller(() => api);
    const previousTab = vi.fn<() => void>();
    const unsubscribe = controller.subscribe(previousTab);
    const pending = controller.refresh();
    unsubscribe();
    previousTab.mockClear();

    const currentTab = vi.fn<() => void>();
    controller.subscribe(currentTab);
    await controller.refresh();
    expect(api.list).toHaveBeenCalledOnce();
    expect(controller.read().loading).toBe(true);

    settle({ entries: [first], nextCursor: null });
    await pending;
    expect(previousTab).not.toHaveBeenCalled();
    expect(currentTab).toHaveBeenCalled();
    expect(controller.read()).toMatchObject({
      entries: [first],
      loading: false,
      error: null,
    });
  });
  it("shows an unsupported state on older hosts", async () => {
    const controller = new SettingsArchives.Controller(() => undefined);
    await controller.refresh();
    expect(controller.read()).toMatchObject({
      supported: false,
      loading: false,
    });
  });
});
