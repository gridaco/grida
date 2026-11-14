import { describe, expect, it } from "vitest";
import { EditorGroup } from "./editor-group";
import { WorkbenchTab } from "./workbench-tab";

describe("WorkbenchTab.key / parse", () => {
  it("round-trips file and panel identities", () => {
    const file: WorkbenchTab = { kind: "file", relPath: "dir/a.svg" };
    const panel: WorkbenchTab = { kind: "panel", id: "side-chat/1" };
    expect(WorkbenchTab.parse(WorkbenchTab.key(file))).toEqual(file);
    expect(WorkbenchTab.parse(WorkbenchTab.key(panel))).toEqual(panel);
  });

  it("never confuses a file named like a panel with a panel", () => {
    const key = WorkbenchTab.file("panel:side-chat");
    expect(key).not.toBe(WorkbenchTab.panel("side-chat"));
    expect(WorkbenchTab.parse(key)).toEqual({
      kind: "file",
      relPath: "panel:side-chat",
    });
  });

  it("rejects a string that is not a tab key", () => {
    expect(() => WorkbenchTab.parse("a.svg")).toThrow();
  });
});

describe("WorkbenchTab.relPath", () => {
  it("is the path of a file tab and null for a panel or no tab", () => {
    expect(WorkbenchTab.relPath(WorkbenchTab.file("a.svg"))).toBe("a.svg");
    expect(WorkbenchTab.relPath(WorkbenchTab.panel("p"))).toBeNull();
    expect(WorkbenchTab.relPath(null)).toBeNull();
  });
});

describe("WorkbenchTab.reopenable", () => {
  it("keeps files and drops panels from reopen-closed history", () => {
    const g = new EditorGroup({ reopenable: WorkbenchTab.reopenable });
    const file = WorkbenchTab.file("a.svg");
    const panel = WorkbenchTab.panel("p");
    g.open(file);
    g.open(panel);
    g.close(file);
    g.close(panel);
    g.reopenClosed();
    expect(g.getSnapshot()).toEqual({ tabs: [file], active: file });
    g.reopenClosed();
    expect(g.getSnapshot().tabs).toEqual([file]);
  });
});

describe("WorkbenchTab.trashed", () => {
  const file = WorkbenchTab.file;
  const panel = WorkbenchTab.panel("p");

  it("closes a folder's subtree and leaves panels open", () => {
    const g = new EditorGroup();
    for (const t of [file("a.txt"), panel, file("dir/x"), file("dir")])
      g.open(t);
    g.activate(file("dir/x"));
    g.closeMatching(WorkbenchTab.trashed("dir", true));
    expect(g.getSnapshot()).toEqual({
      tabs: [file("a.txt"), panel],
      active: panel,
    });
  });

  it("closes only the trashed file, not a sibling sharing its prefix", () => {
    const g = new EditorGroup();
    for (const t of [file("a"), file("a/b"), panel]) g.open(t);
    g.closeMatching(WorkbenchTab.trashed("a", false));
    expect(g.getSnapshot().tabs).toEqual([file("a/b"), panel]);
  });
});
