import { describe, expect, it } from "vitest";
import { WorkspaceViewState } from "./workspace-view-state";

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

describe("WorkspaceViewState", () => {
  it("round-trips one workspace's ordered tabs and active tab", () => {
    const storage = new MemoryStorage();
    const state: WorkspaceViewState.State = {
      tabs: {
        open: ["brief.md", "decks/Launch.canvas", "assets/hero.svg"],
        active: "decks/Launch.canvas",
      },
    };

    WorkspaceViewState.remember(storage, "workspace-a", state);

    expect(WorkspaceViewState.read(storage, "workspace-a")).toEqual(state);
    expect(WorkspaceViewState.read(storage, "workspace-b")).toBeNull();
  });

  it("normalizes unsafe, duplicate, and inconsistent tab state", () => {
    const storage = new MemoryStorage();
    WorkspaceViewState.remember(storage, "workspace-a", {
      tabs: {
        open: ["a.svg", "../outside.svg", "a.svg", "b.svg"],
        active: "missing.svg",
      },
    });

    expect(WorkspaceViewState.read(storage, "workspace-a")).toEqual({
      tabs: { open: ["a.svg", "b.svg"], active: "b.svg" },
    });
  });

  it("drops a corrupt version without affecting another workspace", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "grida.workspaceViewState:workspace-a",
      JSON.stringify({ version: 999, tabs: { open: [], active: null } })
    );
    WorkspaceViewState.remember(storage, "workspace-b", {
      tabs: { open: ["b.svg"], active: "b.svg" },
    });

    expect(WorkspaceViewState.read(storage, "workspace-a")).toBeNull();
    expect(storage.getItem("grida.workspaceViewState:workspace-a")).toBeNull();
    expect(WorkspaceViewState.read(storage, "workspace-b")).toEqual({
      tabs: { open: ["b.svg"], active: "b.svg" },
    });
  });

  it("uses the legacy active path only before workspace state exists", () => {
    const storage = new MemoryStorage();

    expect(
      WorkspaceViewState.initialTabs(
        storage,
        "workspace-a",
        "legacy-active.svg"
      )
    ).toEqual({
      open: ["legacy-active.svg"],
      active: "legacy-active.svg",
    });

    WorkspaceViewState.remember(storage, "workspace-a", {
      tabs: { open: ["current.svg"], active: "current.svg" },
    });
    expect(
      WorkspaceViewState.initialTabs(
        storage,
        "workspace-a",
        "legacy-active.svg"
      )
    ).toEqual({
      open: ["current.svg"],
      active: "current.svg",
    });
  });
});
