import { describe, expect, it, vi } from "vitest";
import type { DesktopBrowser, Workspace } from "@grida/desktop-bridge";
import { SettingsBrowser } from "./settings-browser";

type Clear = NonNullable<DesktopBrowser.Bridge["clearWorkspaceData"]>;
const first: Workspace = {
  id: "aaaaaaaaaaaaaaaa",
  name: "Project",
  root: "/work/first",
  opened_at: 1,
  pinned: false,
};
const second: Workspace = {
  id: "bbbbbbbbbbbbbbbb",
  name: "Project",
  root: "/work/second",
  opened_at: 2,
  pinned: false,
};
function fixture() {
  const api = { clearWorkspaceData: vi.fn<Clear>().mockResolvedValue(true) };
  const list = vi
    .fn<() => Promise<readonly Workspace[]>>()
    .mockResolvedValue([first, second]);
  const controller = new SettingsBrowser.Controller(() => api, list);
  return { api, list, controller };
}

describe("SettingsBrowser.Controller", () => {
  it("requires an explicit registered workspace choice and passes only its identity", async () => {
    const { api, list, controller } = fixture();
    await controller.refresh();
    expect(list).toHaveBeenCalledOnce();
    expect(controller.read().selectedId).toBeNull();
    await controller.clearSelected();
    expect(api.clearWorkspaceData).not.toHaveBeenCalled();
    controller.select("unknown");
    expect(controller.read().selectedId).toBeNull();
    controller.select(first.id);
    await controller.clearSelected();
    expect(api.clearWorkspaceData).toHaveBeenCalledExactlyOnceWith({
      workspaceId: first.id,
    });
    expect(controller.read()).toMatchObject({
      clearing: false,
      result: "cleared",
      selectedId: first.id,
      error: null,
    });
    expect(controller.read().workspaces).toEqual([
      { id: first.id, name: first.name, root: first.root },
      { id: second.id, name: second.name, root: second.root },
    ]);
  });

  it("treats the native false result as cancellation without claiming success", async () => {
    const { api, controller } = fixture();
    api.clearWorkspaceData.mockResolvedValue(false);
    await controller.refresh();
    controller.select(first.id);
    await controller.clearSelected();
    expect(controller.read()).toMatchObject({
      result: "cancelled",
      clearing: false,
      error: null,
      selectedId: first.id,
    });
  });

  it("reports clear failures without exposing private native diagnostics", async () => {
    const { api, controller } = fixture();
    api.clearWorkspaceData.mockRejectedValue(
      new Error("/private/browser-profile/secret")
    );
    await controller.refresh();
    controller.select(first.id);
    await controller.clearSelected();
    expect(controller.read().result).toBeNull();
    expect(controller.read().clearing).toBe(false);
    expect(controller.read().error).toContain("Refresh the list");
    expect(controller.read().error).not.toContain("/private");
  });

  it("deduplicates clear and focus refresh while native confirmation or clearing is pending", async () => {
    const { api, list, controller } = fixture();
    let resolve!: (value: boolean) => void;
    api.clearWorkspaceData.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    await controller.refresh();
    controller.select(first.id);
    const clearing = controller.clearSelected();
    expect(controller.read().clearing).toBe(true);
    await controller.clearSelected();
    await controller.refresh();
    controller.select(second.id);
    expect(api.clearWorkspaceData).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
    expect(controller.read().selectedId).toBe(first.id);
    resolve(true);
    await clearing;
    expect(controller.read().result).toBe("cleared");
  });

  it("deduplicates metadata refresh and returned workspace identities", async () => {
    const { list, controller } = fixture();
    let resolve!: (value: readonly Workspace[]) => void;
    list.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const loading = controller.refresh();
    await controller.refresh();
    expect(list).toHaveBeenCalledTimes(1);
    resolve([first, first, second]);
    await loading;
    expect(
      controller.read().workspaces.map((workspace) => workspace.id)
    ).toEqual([first.id, second.id]);
    expect(controller.read().selectedId).toBeNull();
  });

  it("preserves an explicit choice on refresh and clears it when that workspace disappears", async () => {
    const { list, controller } = fixture();
    await controller.refresh();
    controller.select(second.id);
    await controller.refresh();
    expect(controller.read().selectedId).toBe(second.id);
    list.mockResolvedValue([first]);
    await controller.refresh();
    expect(controller.read().selectedId).toBeNull();
    expect(controller.read().workspaces).toEqual([
      { id: first.id, name: first.name, root: first.root },
    ]);
  });

  it("keeps loaded choices on refresh failure and offers a safe retry message", async () => {
    const { list, controller } = fixture();
    await controller.refresh();
    controller.select(first.id);
    list.mockRejectedValue(new Error("/private/catalog/profile"));
    await controller.refresh();
    expect(controller.read().selectedId).toBe(first.id);
    expect(controller.read().workspaces).toHaveLength(2);
    expect(controller.read().loading).toBe(false);
    expect(controller.read().error).toBe(
      "Couldn’t load workspaces. Try refreshing the list."
    );
  });

  it("ignores metadata from a cancelled generation after a newer refresh", async () => {
    const { list, controller } = fixture();
    let resolve!: (value: readonly Workspace[]) => void;
    list.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    const stale = controller.refresh();
    controller.cancel();
    list.mockResolvedValueOnce([second]);
    await controller.refresh();
    controller.select(second.id);
    resolve([first]);
    await stale;
    expect(controller.read().selectedId).toBe(second.id);
    expect(
      controller.read().workspaces.map((workspace) => workspace.id)
    ).toEqual([second.id]);
  });

  it("ignores an old clear result without unlocking a newer pending operation", async () => {
    const { api, controller } = fixture();
    let finishOld!: (value: boolean) => void;
    let finishNew!: (value: boolean) => void;
    api.clearWorkspaceData
      .mockReturnValueOnce(
        new Promise((done) => {
          finishOld = done;
        })
      )
      .mockReturnValueOnce(
        new Promise((done) => {
          finishNew = done;
        })
      );
    await controller.refresh();
    controller.select(first.id);
    const old = controller.clearSelected();
    controller.cancel();
    await controller.refresh();
    controller.select(second.id);
    const current = controller.clearSelected();
    finishOld(true);
    await old;
    expect(controller.read()).toMatchObject({
      clearing: true,
      result: null,
      selectedId: second.id,
    });
    finishNew(false);
    await current;
    expect(controller.read()).toMatchObject({
      clearing: false,
      result: "cancelled",
      selectedId: second.id,
    });
  });

  it("stays unsupported on older hosts without calling workspace or page operations", async () => {
    const list = vi.fn<() => Promise<readonly Workspace[]>>();
    const controller = new SettingsBrowser.Controller(() => ({}), list);
    await controller.refresh();
    await controller.clearSelected();
    expect(list).not.toHaveBeenCalled();
    expect(controller.read()).toMatchObject({
      supported: false,
      loading: false,
      workspaces: [],
      selectedId: null,
      clearing: false,
    });
  });

  it("does not interpret malformed native results as cancellation", async () => {
    const { api, controller } = fixture();
    api.clearWorkspaceData.mockResolvedValue(
      "unexpected" as unknown as boolean
    );
    await controller.refresh();
    controller.select(first.id);
    await controller.clearSelected();
    expect(controller.read().result).toBeNull();
    expect(controller.read().error).not.toBeNull();
  });
});
