import { describe, expect, it, vi } from "vitest";
import { EditorGroup } from "./editor-group";
import { WorkbenchPanels } from "./workbench-panels";
import { WorkbenchTab } from "./workbench-tab";

const file = WorkbenchTab.file;
const panelKey = WorkbenchTab.panel;

function fixture() {
  const group = new EditorGroup({ reopenable: WorkbenchTab.reopenable });
  const panels = new WorkbenchPanels(group);
  const dismissed = vi.fn<() => void>();
  return { group, panels, dismissed };
}

describe("WorkbenchPanels.show", () => {
  it("opens a new panel as the active tab and exposes its content", () => {
    const { group, panels, dismissed } = fixture();
    group.open(file("a.svg"));
    panels.show("p", { title: "Panel", content: "one" }, dismissed);
    expect(group.getSnapshot()).toEqual({
      tabs: [file("a.svg"), panelKey("p")],
      active: panelKey("p"),
    });
    expect(panels.getSnapshot().get("p")?.content).toBe("one");
  });

  it("updates a shown panel in place without taking focus", () => {
    const { group, panels, dismissed } = fixture();
    panels.show("p", { title: "Panel", content: "one" }, dismissed);
    group.open(file("a.svg"));
    const before = panels.getSnapshot();
    panels.show("p", { title: "Panel", content: "two" }, dismissed);
    expect(group.getSnapshot().active).toBe(file("a.svg"));
    expect(panels.getSnapshot()).not.toBe(before);
    expect(panels.getSnapshot().get("p")?.content).toBe("two");
  });
});

describe("WorkbenchPanels.reveal", () => {
  it("focuses a shown panel and ignores an unknown one", () => {
    const { group, panels, dismissed } = fixture();
    panels.show("p", { title: "Panel", content: null }, dismissed);
    group.open(file("a.svg"));
    panels.reveal("missing");
    expect(group.getSnapshot().active).toBe(file("a.svg"));
    panels.reveal("p");
    expect(group.getSnapshot().active).toBe(panelKey("p"));
  });
});

describe("WorkbenchPanels — dismissal from the tab", () => {
  it("removes the panel and calls dismissed once when its tab closes", () => {
    const { group, panels, dismissed } = fixture();
    group.open(file("a.svg"));
    panels.show("p", { title: "Panel", content: null }, dismissed);
    group.close(panelKey("p"));
    expect(dismissed).toHaveBeenCalledTimes(1);
    expect(panels.getSnapshot().has("p")).toBe(false);
    expect(group.getSnapshot()).toEqual({
      tabs: [file("a.svg")],
      active: file("a.svg"),
    });
    group.open(file("b.svg"));
    expect(dismissed).toHaveBeenCalledTimes(1);
  });

  it("is never reopened from reopen-closed history", () => {
    const { group, panels, dismissed } = fixture();
    group.open(file("a.svg"));
    panels.show("p", { title: "Panel", content: null }, dismissed);
    group.close(panelKey("p"));
    group.reopenClosed();
    expect(group.getSnapshot().tabs).toEqual([file("a.svg")]);
  });

  it("is not closed by trashing a folder", () => {
    const { group, panels, dismissed } = fixture();
    group.open(file("dir/a.svg"));
    panels.show("p", { title: "Panel", content: null }, dismissed);
    group.activate(file("dir/a.svg"));
    group.closeMatching(WorkbenchTab.trashed("dir", true));
    expect(dismissed).not.toHaveBeenCalled();
    expect(group.getSnapshot()).toEqual({
      tabs: [panelKey("p")],
      active: panelKey("p"),
    });
  });
});

describe("WorkbenchPanels.withdraw", () => {
  it("closes the tab without calling dismissed and focuses its neighbor", () => {
    const { group, panels, dismissed } = fixture();
    group.open(file("a.svg"));
    panels.show("p", { title: "Panel", content: null }, dismissed);
    group.open(file("b.svg"));
    group.activate(panelKey("p"));
    panels.withdraw("p");
    expect(dismissed).not.toHaveBeenCalled();
    expect(panels.getSnapshot().size).toBe(0);
    expect(group.getSnapshot()).toEqual({
      tabs: [file("a.svg"), file("b.svg")],
      active: file("a.svg"),
    });
    group.reopenClosed();
    expect(group.getSnapshot().tabs).toEqual([file("a.svg"), file("b.svg")]);
  });

  it("stops observing the group once no panel is shown", () => {
    const { group, panels, dismissed } = fixture();
    const subscribe = vi.spyOn(group, "subscribe");
    panels.show("p", { title: "Panel", content: null }, dismissed);
    const unsubscribe = subscribe.mock.results[0]?.value as () => boolean;
    expect(unsubscribe).toBeTypeOf("function");
    panels.withdraw("p");
    expect(unsubscribe()).toBe(false);
  });
});
