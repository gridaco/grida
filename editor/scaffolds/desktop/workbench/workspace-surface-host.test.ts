import { describe, expect, it, vi } from "vitest";
import type { WorkspaceFsEntry } from "@grida/desktop-bridge";
import { WorkspaceArtifact } from "@/lib/desktop/workspace-artifact";
import { EditorGroup } from "./editor-group";
import { WorkspaceSurfaceHost } from "./workspace-surface-host";

function createHost(entries: WorkspaceFsEntry[]) {
  const group = new EditorGroup();
  const readdir = vi.fn<WorkspaceArtifact.Readdir>(async () => entries);
  return {
    group,
    readdir,
    host: new WorkspaceSurfaceHost(readdir, group),
  };
}

describe("WorkspaceSurfaceHost.open", () => {
  it("opens a live file using the editor group's relative id", async () => {
    const { host, group, readdir } = createHost([
      {
        name: "hero.svg",
        rel_path: "assets/hero.svg",
        kind: "file",
      },
    ]);

    await host.open("/assets/hero.svg");
    expect(readdir).toHaveBeenCalledWith("assets");
    expect(group.getSnapshot()).toEqual({
      tabs: ["assets/hero.svg"],
      active: "assets/hero.svg",
    });
  });

  it("activates an existing tab without duplicating it", async () => {
    const { host, group } = createHost([
      { name: "a.svg", rel_path: "a.svg", kind: "file" },
      { name: "b.svg", rel_path: "b.svg", kind: "file" },
    ]);
    group.open("a.svg");
    group.open("b.svg");

    await host.open("/a.svg");
    expect(group.getSnapshot()).toEqual({
      tabs: ["a.svg", "b.svg"],
      active: "a.svg",
    });
  });

  it("accepts a `.canvas` directory but rejects a plain directory", async () => {
    const entries: WorkspaceFsEntry[] = [
      {
        name: "Launch.canvas",
        rel_path: "Launch.canvas",
        kind: "directory",
      },
      { name: "assets", rel_path: "assets", kind: "directory" },
    ];
    const { host, group } = createHost(entries);

    await host.open("/Launch.canvas");
    await host.open("/assets");
    expect(group.getSnapshot().tabs).toEqual(["Launch.canvas"]);
  });

  it("rejects invalid, missing, and non-file paths without opening a tab", async () => {
    const { host, group, readdir } = createHost([]);

    await host.open("../outside.svg");
    await host.open("/missing.svg");
    expect(readdir).toHaveBeenCalledTimes(1);
    expect(group.getSnapshot()).toEqual({ tabs: [], active: null });
  });

  it("does not override newer user navigation after async validation", async () => {
    let resolveEntries!: (entries: WorkspaceFsEntry[]) => void;
    const entries = new Promise<WorkspaceFsEntry[]>((resolve) => {
      resolveEntries = resolve;
    });
    const readdir = vi.fn<WorkspaceArtifact.Readdir>(() => entries);
    const group = new EditorGroup();
    const host = new WorkspaceSurfaceHost(readdir, group);
    group.open("before.svg");

    const opening = host.open("/agent.svg");
    group.open("user.svg");
    resolveEntries([
      { name: "agent.svg", rel_path: "agent.svg", kind: "file" },
    ]);
    await opening;

    expect(group.getSnapshot()).toEqual({
      tabs: ["before.svg", "user.svg"],
      active: "user.svg",
    });
  });
});

describe("WorkspaceSurfaceHost.listOpen", () => {
  it("returns canonical paths, excludes virtual tabs, and reports file activity", () => {
    const { host, group } = createHost([]);
    group.open("a.svg");
    group.open("virtual://design-search");

    expect(host.listOpen()).toEqual({
      active: null,
      open: ["/a.svg"],
    });

    group.activate("a.svg");
    expect(host.listOpen()).toEqual({
      active: "/a.svg",
      open: ["/a.svg"],
    });
  });
});

describe("WorkspaceSurfaceHost.restoreRelative", () => {
  it("restores live tabs in saved order and activates the remembered tab once", async () => {
    const { host, group } = createHost([
      { name: "a.svg", rel_path: "a.svg", kind: "file" },
      { name: "b.svg", rel_path: "b.svg", kind: "file" },
      { name: "c.svg", rel_path: "c.svg", kind: "file" },
    ]);
    const listener = vi.fn<() => void>();
    group.subscribe(listener);

    await host.restoreRelative({
      open: ["a.svg", "b.svg", "c.svg"],
      active: "b.svg",
    });

    expect(group.getSnapshot()).toEqual({
      tabs: ["a.svg", "b.svg", "c.svg"],
      active: "b.svg",
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("drops missing tabs and falls back to the last live tab", async () => {
    const { host, group } = createHost([
      { name: "a.svg", rel_path: "a.svg", kind: "file" },
      { name: "c.svg", rel_path: "c.svg", kind: "file" },
    ]);

    await host.restoreRelative({
      open: ["a.svg", "missing.svg", "c.svg"],
      active: "missing.svg",
    });

    expect(group.getSnapshot()).toEqual({
      tabs: ["a.svg", "c.svg"],
      active: "c.svg",
    });
  });

  it("does not replace newer user navigation after async validation", async () => {
    let resolveEntries!: (entries: WorkspaceFsEntry[]) => void;
    const entries = new Promise<WorkspaceFsEntry[]>((resolve) => {
      resolveEntries = resolve;
    });
    const readdir = vi.fn<WorkspaceArtifact.Readdir>(() => entries);
    const group = new EditorGroup();
    const host = new WorkspaceSurfaceHost(readdir, group);

    const restoring = host.restoreRelative({
      open: ["remembered.svg"],
      active: "remembered.svg",
    });
    group.open("user.svg");
    resolveEntries([
      {
        name: "remembered.svg",
        rel_path: "remembered.svg",
        kind: "file",
      },
    ]);
    await restoring;

    expect(group.getSnapshot()).toEqual({
      tabs: ["user.svg"],
      active: "user.svg",
    });
  });
});

describe("WorkspaceSurfaceHost.rememberedTabs", () => {
  it("keeps ordered real tabs and the active real artifact", () => {
    const { host, group } = createHost([]);
    group.open("a.svg");
    group.open("b.svg");
    group.activate("a.svg");

    expect(host.rememberedTabs()).toEqual({
      open: ["a.svg", "b.svg"],
      active: "a.svg",
    });
  });

  it("uses the last still-open real tab while a virtual tab is active", () => {
    const { host, group } = createHost([]);
    group.open("a.svg");
    group.open("b.svg");
    group.open("virtual://design-search");

    expect(host.rememberedTabs()).toEqual({
      open: ["a.svg", "b.svg"],
      active: "b.svg",
    });

    group.close("b.svg");
    expect(host.rememberedTabs()).toEqual({
      open: ["a.svg"],
      active: "a.svg",
    });
  });

  it("persists an empty group when only virtual tabs remain", () => {
    const { host, group } = createHost([]);
    group.open("remembered.svg");
    group.open("virtual://design-search");
    group.close("remembered.svg");

    expect(host.rememberedTabs()).toEqual({ open: [], active: null });
  });
});
