import { describe, expect, it, vi } from "vitest";
import { WindowContentState } from "./window-content-state";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("WindowContentState", () => {
  it("records Home after a workspace and restores it without workspace reads", async () => {
    const storage = new MemoryStorage();
    WindowContentState.remember(storage, {
      surface: "workbench",
      workspace_id: "workspace-a",
    });
    WindowContentState.remember(storage, { surface: "home" });
    const list = vi.fn<() => Promise<[]>>(async () => []);

    await expect(
      WindowContentState.resolve(storage, {
        list,
        openFolder: async (root) => ({ id: "workspace-a", root }),
        readdir: async () => [],
      })
    ).resolves.toEqual({ surface: "home" });
    expect(list).not.toHaveBeenCalled();
  });
  it("round-trips a workbench target and builds its route", () => {
    const storage = new MemoryStorage();
    const target = {
      surface: "workbench",
      workspace_id: "workspace-a",
    } as const;

    WindowContentState.remember(storage, target);

    expect(WindowContentState.read(storage)).toEqual(target);
    expect(WindowContentState.href(target)).toBe(
      "/desktop/workspace?id=workspace-a"
    );
  });

  it("round-trips the workbench's last active artifact", () => {
    const storage = new MemoryStorage();
    const target = {
      surface: "workbench",
      workspace_id: "workspace-a",
      active_path: "decks/Launch.canvas",
    } as const;

    WindowContentState.remember(storage, target);

    expect(WindowContentState.read(storage)).toEqual(target);
    expect(WindowContentState.href(target)).toBe(
      "/desktop/workspace?id=workspace-a&path=decks%2FLaunch.canvas"
    );
  });

  it("drops an unsafe active artifact without losing its workspace", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "grida.lastWorkspace",
      JSON.stringify({
        version: 1,
        surface: "workbench",
        workspace_id: "workspace-a",
        active_path: "../outside.svg",
      })
    );

    expect(WindowContentState.read(storage)).toEqual({
      surface: "workbench",
      workspace_id: "workspace-a",
    });
  });

  it("round-trips a canvas target including its bundle path", () => {
    const storage = new MemoryStorage();
    const target = {
      surface: "canvas",
      workspace_id: "workspace-a",
      base_path: "decks/Launch.canvas",
    } as const;

    WindowContentState.remember(storage, target);

    expect(WindowContentState.read(storage)).toEqual(target);
    expect(WindowContentState.href(target)).toBe(
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

    expect(WindowContentState.read(storage)).toBeNull();
  });

  it("validates and re-opens the saved workspace before restoring", async () => {
    const storage = new MemoryStorage();
    WindowContentState.remember(storage, {
      surface: "workbench",
      workspace_id: "workspace-a",
    });
    const openFolder = vi.fn<
      (root: string) => Promise<{ id: string; root: string }>
    >(async (root) => ({ id: "workspace-a", root }));

    await expect(
      WindowContentState.resolve(storage, {
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

  it("restores a legacy workbench artifact after validating its parent", async () => {
    const storage = new MemoryStorage();
    const target = {
      surface: "workbench",
      workspace_id: "workspace-a",
      active_path: "decks/Launch.canvas",
    } as const;
    storage.setItem(
      "grida.lastWorkspace",
      JSON.stringify({ version: 1, ...target })
    );

    await expect(
      WindowContentState.resolve(storage, {
        list: async () => [{ id: "workspace-a", root: "/projects/a" }],
        openFolder: async (root) => ({ id: "workspace-a", root }),
        readdir: async (workspaceId, relPath) => {
          expect(workspaceId).toBe("workspace-a");
          expect(relPath).toBe("decks");
          return [
            {
              name: "Launch.canvas",
              rel_path: "decks/Launch.canvas",
              kind: "directory",
            },
          ];
        },
      })
    ).resolves.toEqual(target);
  });

  it("falls back to the workspace without overwriting Home saved during restore", async () => {
    const storage = new MemoryStorage();
    WindowContentState.remember(storage, {
      surface: "workbench",
      workspace_id: "workspace-a",
      active_path: "removed.svg",
    });

    await expect(
      WindowContentState.resolve(storage, {
        list: async () => [{ id: "workspace-a", root: "/projects/a" }],
        openFolder: async (root) => ({ id: "workspace-a", root }),
        readdir: async () => {
          WindowContentState.remember(storage, { surface: "home" });
          return [];
        },
      })
    ).resolves.toEqual({
      surface: "workbench",
      workspace_id: "workspace-a",
    });
    expect(WindowContentState.read(storage)).toEqual({ surface: "home" });
  });

  it("skips a workspace id that is no longer registered", async () => {
    const storage = new MemoryStorage();
    WindowContentState.remember(storage, {
      surface: "workbench",
      workspace_id: "workspace-a",
    });

    await expect(
      WindowContentState.resolve(storage, {
        list: async () => [],
        openFolder:
          vi.fn<(root: string) => Promise<{ id: string; root: string }>>(),
        readdir: async () => [],
      })
    ).resolves.toBeNull();
  });

  it("keeps the target when its registered path is temporarily unavailable", async () => {
    const storage = new MemoryStorage();
    const target = {
      surface: "workbench",
      workspace_id: "workspace-a",
    } as const;
    WindowContentState.remember(storage, target);

    await expect(
      WindowContentState.resolve(storage, {
        list: async () => [{ id: "workspace-a", root: "/offline/a" }],
        openFolder: async () => {
          throw new Error("ENOENT");
        },
        readdir: async () => [],
      })
    ).rejects.toThrow("ENOENT");
    expect(WindowContentState.read(storage)).toEqual(target);
  });

  it("validates a saved canvas directory before restoring it", async () => {
    const storage = new MemoryStorage();
    const target = {
      surface: "canvas",
      workspace_id: "workspace-a",
      base_path: "decks/Launch.canvas",
    } as const;
    WindowContentState.remember(storage, target);

    await expect(
      WindowContentState.resolve(storage, {
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

  it("skips a saved canvas directory that no longer exists", async () => {
    const storage = new MemoryStorage();
    WindowContentState.remember(storage, {
      surface: "canvas",
      workspace_id: "workspace-a",
      base_path: "decks/Removed.canvas",
    });

    await expect(
      WindowContentState.resolve(storage, {
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
  });
});
