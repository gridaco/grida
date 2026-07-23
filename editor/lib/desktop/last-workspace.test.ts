import { describe, expect, it, vi } from "vitest";
import { last_workspace } from "./last-workspace";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("last_workspace", () => {
  it("round-trips a workbench target and builds its route", () => {
    const storage = new MemoryStorage();
    const target = {
      surface: "workbench",
      workspace_id: "workspace-a",
    } as const;

    last_workspace.remember(storage, target);

    expect(last_workspace.read(storage)).toEqual(target);
    expect(last_workspace.href(target)).toBe(
      "/desktop/workspace?id=workspace-a"
    );
  });

  it("round-trips a canvas target including its bundle path", () => {
    const storage = new MemoryStorage();
    const target = {
      surface: "canvas",
      workspace_id: "workspace-a",
      base_path: "decks/Launch.canvas",
    } as const;

    last_workspace.remember(storage, target);

    expect(last_workspace.read(storage)).toEqual(target);
    expect(last_workspace.href(target)).toBe(
      "/desktop/file?id=workspace-a&path=decks%2FLaunch.canvas"
    );
  });

  it("drops corrupt or unsafe stored state", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "grida.lastWorkspace",
      JSON.stringify({
        version: 1,
        surface: "canvas",
        workspace_id: "workspace-a",
        base_path: "../outside.canvas",
      })
    );

    expect(last_workspace.read(storage)).toBeNull();
    expect(storage.getItem("grida.lastWorkspace")).toBeNull();
  });

  it("validates and re-opens the saved workspace before restoring", async () => {
    const storage = new MemoryStorage();
    last_workspace.remember(storage, {
      surface: "workbench",
      workspace_id: "workspace-a",
    });
    const openFolder = vi.fn<
      (root: string) => Promise<{ id: string; root: string }>
    >(async (root) => ({ id: "workspace-a", root }));

    await expect(
      last_workspace.resolve(storage, {
        list: async () => [{ id: "workspace-a", root: "/projects/a" }],
        openFolder,
        readdir: async () => [],
      })
    ).resolves.toEqual({
      surface: "workbench",
      workspace_id: "workspace-a",
    });
    expect(openFolder).toHaveBeenCalledWith("/projects/a");
  });

  it("forgets a workspace id that is no longer registered", async () => {
    const storage = new MemoryStorage();
    last_workspace.remember(storage, {
      surface: "workbench",
      workspace_id: "workspace-a",
    });

    await expect(
      last_workspace.resolve(storage, {
        list: async () => [],
        openFolder:
          vi.fn<(root: string) => Promise<{ id: string; root: string }>>(),
        readdir: async () => [],
      })
    ).resolves.toBeNull();
    expect(last_workspace.read(storage)).toBeNull();
  });

  it("keeps the target when its registered path is temporarily unavailable", async () => {
    const storage = new MemoryStorage();
    const target = {
      surface: "workbench",
      workspace_id: "workspace-a",
    } as const;
    last_workspace.remember(storage, target);

    await expect(
      last_workspace.resolve(storage, {
        list: async () => [{ id: "workspace-a", root: "/offline/a" }],
        openFolder: async () => {
          throw new Error("ENOENT");
        },
        readdir: async () => [],
      })
    ).rejects.toThrow("ENOENT");
    expect(last_workspace.read(storage)).toEqual(target);
  });

  it("validates a saved canvas directory before restoring it", async () => {
    const storage = new MemoryStorage();
    const target = {
      surface: "canvas",
      workspace_id: "workspace-a",
      base_path: "decks/Launch.canvas",
    } as const;
    last_workspace.remember(storage, target);

    await expect(
      last_workspace.resolve(storage, {
        list: async () => [{ id: "workspace-a", root: "/projects/a" }],
        openFolder: async (root) => ({ id: "workspace-a", root }),
        readdir: async (workspaceId, relPath) => {
          expect(workspaceId).toBe("workspace-a");
          expect(relPath).toBe("decks/Launch.canvas");
          return [];
        },
      })
    ).resolves.toEqual(target);
  });

  it("forgets a saved canvas directory that no longer exists", async () => {
    const storage = new MemoryStorage();
    last_workspace.remember(storage, {
      surface: "canvas",
      workspace_id: "workspace-a",
      base_path: "decks/Removed.canvas",
    });

    await expect(
      last_workspace.resolve(storage, {
        list: async () => [{ id: "workspace-a", root: "/projects/a" }],
        openFolder: async (root) => ({ id: "workspace-a", root }),
        readdir: async () => {
          throw Object.assign(new Error("ENOENT"), {
            status: 404,
            code: "enoent",
          });
        },
      })
    ).resolves.toBeNull();
    expect(last_workspace.read(storage)).toBeNull();
  });
});
