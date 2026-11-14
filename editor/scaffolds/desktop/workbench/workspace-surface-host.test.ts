import { describe, expect, it, vi } from "vitest";
import type { WorkspaceFsEntry } from "@grida/desktop-bridge";
import { WorkspaceArtifact } from "@/lib/desktop/workspace-artifact";
import { EditorGroup } from "./editor-group";
import { WorkbenchTab } from "./workbench-tab";

const file = WorkbenchTab.file;
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
      tabs: [file("assets/hero.svg")],
      active: file("assets/hero.svg"),
    });
  });

  it("activates an existing tab without duplicating it", async () => {
    const { host, group } = createHost([
      { name: "a.svg", rel_path: "a.svg", kind: "file" },
      { name: "b.svg", rel_path: "b.svg", kind: "file" },
    ]);
    group.open(file("a.svg"));
    group.open(file("b.svg"));

    await host.open("/a.svg");
    expect(group.getSnapshot()).toEqual({
      tabs: [file("a.svg"), file("b.svg")],
      active: file("a.svg"),
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
    expect(group.getSnapshot().tabs).toEqual([file("Launch.canvas")]);
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
    group.open(file("before.svg"));

    const opening = host.open("/agent.svg");
    group.open(file("user.svg"));
    resolveEntries([
      { name: "agent.svg", rel_path: "agent.svg", kind: "file" },
    ]);
    await opening;

    expect(group.getSnapshot()).toEqual({
      tabs: [file("before.svg"), file("user.svg")],
      active: file("user.svg"),
    });
  });

  it("requires the original presentation owner before and after path validation", async () => {
    const entries = Promise.withResolvers<WorkspaceFsEntry[]>();
    const readdir = vi.fn<WorkspaceArtifact.Readdir>(() => entries.promise);
    const group = new EditorGroup();
    const host = new WorkspaceSurfaceHost(readdir, group);
    let live = false;
    await host.open("/requested.svg", () => live);
    expect(readdir).not.toHaveBeenCalled();
    live = true;
    const pending = host.open("/requested.svg", () => live);
    live = false;
    entries.resolve([
      { name: "requested.svg", rel_path: "requested.svg", kind: "file" },
    ]);
    await pending;
    expect(readdir).toHaveBeenCalledTimes(1);
    expect(group.getSnapshot()).toEqual({ tabs: [], active: null });
  });
});

describe("WorkspaceSurfaceHost.listOpen", () => {
  it("returns canonical paths and reports file activity", () => {
    const { host, group } = createHost([]);
    group.open(file("a.svg"));
    group.open(file("b.svg"));

    expect(host.listOpen()).toEqual({
      active: "/b.svg",
      open: ["/a.svg", "/b.svg"],
    });

    group.activate(file("a.svg"));
    expect(host.listOpen()).toEqual({
      active: "/a.svg",
      open: ["/a.svg", "/b.svg"],
    });
  });

  it("updates the native projection on editor group changes", () => {
    const { host, group } = createHost([]);
    const observe = vi.fn<() => void>();
    const unsubscribe = host.subscribeToEditorSurfaces(observe);
    group.open(file("a.svg"));
    group.open(file("b.canvas"));
    expect(host.readEditorSurfaces()).toEqual({
      active: "/b.canvas",
      open: ["/a.svg", "/b.canvas"],
      truncated: false,
    });
    group.activate(file("a.svg"));
    expect(observe).toHaveBeenCalledTimes(3);
    expect(host.readEditorSurfaces().active).toBe("/a.svg");
    unsubscribe();
    group.activate(file("b.canvas"));
    expect(observe).toHaveBeenCalledTimes(3);
  });

  it("publishes only the latest bounded view after an outstanding publication", async () => {
    const { host, group } = createHost([]);
    const first = Promise.withResolvers<boolean>();
    type Publish = Parameters<WorkspaceSurfaceHost["publishEditorSurfaces"]>[0];
    const publish = vi.fn<Publish>();
    publish.mockReturnValueOnce(first.promise);
    publish.mockResolvedValue(false);
    const release = host.publishEditorSurfaces(publish);
    try {
      group.open(file("a.svg"));
      group.open(file("b.canvas"));
      expect(publish).toHaveBeenCalledExactlyOnceWith({
        active: null,
        open: [],
        truncated: false,
      });
      first.resolve(true);
      await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(2));
      expect(publish).toHaveBeenLastCalledWith({
        active: "/b.canvas",
        open: ["/a.svg", "/b.canvas"],
        truncated: false,
      });
      group.activate(file("a.svg"));
      expect(publish).toHaveBeenCalledTimes(2);
    } finally {
      release();
    }
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
      tabs: [file("a.svg"), file("b.svg"), file("c.svg")],
      active: file("b.svg"),
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
      tabs: [file("a.svg"), file("c.svg")],
      active: file("c.svg"),
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
    group.open(file("user.svg"));
    resolveEntries([
      {
        name: "remembered.svg",
        rel_path: "remembered.svg",
        kind: "file",
      },
    ]);
    await restoring;

    expect(group.getSnapshot()).toEqual({
      tabs: [file("user.svg")],
      active: file("user.svg"),
    });
  });
});

describe("WorkspaceSurfaceHost.rememberedTabs", () => {
  it("keeps ordered real tabs and the active real artifact", () => {
    const { host, group } = createHost([]);
    group.open(file("a.svg"));
    group.open(file("b.svg"));
    group.activate(file("a.svg"));

    expect(host.rememberedTabs()).toEqual({
      open: ["a.svg", "b.svg"],
      active: "a.svg",
    });
  });

  it("falls back to the last open tab after the active one closes", () => {
    const { host, group } = createHost([]);
    group.open(file("a.svg"));
    group.open(file("b.svg"));
    group.close(file("b.svg"));

    expect(host.rememberedTabs()).toEqual({
      open: ["a.svg"],
      active: "a.svg",
    });
  });

  it("persists an empty group when no tabs remain", () => {
    const { host, group } = createHost([]);
    group.open(file("remembered.svg"));
    group.close(file("remembered.svg"));

    expect(host.rememberedTabs()).toEqual({ open: [], active: null });
  });
});

describe("WorkspaceSurfaceHost — panel tabs", () => {
  it("lists and remembers file tabs only", () => {
    const { host, group } = createHost([]);
    group.open(file("a.svg"));
    group.open(WorkbenchTab.panel("side-chat/1"));

    expect(host.listOpen()).toEqual({ active: null, open: ["/a.svg"] });
    expect(host.rememberedTabs()).toEqual({ open: ["a.svg"], active: "a.svg" });
  });
});
