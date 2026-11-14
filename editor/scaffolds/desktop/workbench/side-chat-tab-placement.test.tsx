import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorGroup } from "./editor-group";
import { SideChatPlacement } from "./side-chat-placement";
import { FakeSideChatParent } from "./side-chat-placement.fixtures";
import { SideChatTabPlacement } from "./side-chat-tab-placement";
import { WorkbenchPanels } from "./workbench-panels";
import { WorkbenchTab } from "./workbench-tab";

const file = WorkbenchTab.file;

function fixture() {
  const group = new EditorGroup({ reopenable: WorkbenchTab.reopenable });
  const panels = new WorkbenchPanels(group);
  const parent = new FakeSideChatParent();
  const stop = SideChatPlacement.connect(
    parent,
    new SideChatTabPlacement(panels),
    () => true
  );
  const tabOf = (id: string) =>
    WorkbenchTab.panel(SideChatTabPlacement.panel(id));
  return { group, panels, parent, stop, tabOf };
}

describe("SideChatTabPlacement", () => {
  it("opens a side chat as the focused Side chat tab showing its view", () => {
    const { group, panels, parent, tabOf } = fixture();
    group.open(file("a.svg"));
    const side = parent.open();
    expect(group.getSnapshot()).toEqual({
      tabs: [file("a.svg"), tabOf(side.id)],
      active: tabOf(side.id),
    });
    const panel = panels
      .getSnapshot()
      .get(SideChatTabPlacement.panel(side.id))!;
    expect(panel.title).toBe("Side chat");
    expect(renderToStaticMarkup(<>{panel.content}</>)).toContain(
      'data-testid="native-side-chat"'
    );
  });

  it("ends the side chat when its tab closes, and never reopens it", async () => {
    const { group, parent, tabOf } = fixture();
    group.open(file("a.svg"));
    const side = parent.open();
    group.close(tabOf(side.id));
    expect(parent.close).toHaveBeenCalledTimes(1);
    expect(group.getSnapshot()).toEqual({
      tabs: [file("a.svg")],
      active: file("a.svg"),
    });
    // Parent updates while the side chat is still closing keep the tab shut.
    parent.set({ acting: true });
    expect(group.getSnapshot().tabs).toEqual([file("a.svg")]);
    await vi.waitFor(() => expect(parent.read().sideChat).toBeNull());
    group.reopenClosed();
    expect(group.getSnapshot().tabs).toEqual([file("a.svg")]);
    expect(parent.close).toHaveBeenCalledTimes(1);
  });

  it("closes its tab when the side chat ends from the parent", async () => {
    const { group, parent, tabOf } = fixture();
    group.open(file("a.svg"));
    const side = parent.open();
    group.activate(file("a.svg"));
    await parent.closeSideChat();
    expect(group.getSnapshot()).toEqual({
      tabs: [file("a.svg")],
      active: file("a.svg"),
    });
    expect(group.getSnapshot().tabs).not.toContain(tabOf(side.id));
  });

  it("closes its tab when the parent switches chats or disconnects", () => {
    const { group, parent, stop, tabOf } = fixture();
    const first = parent.open();
    parent.set({ sideChat: null });
    expect(group.getSnapshot().tabs).not.toContain(tabOf(first.id));
    const second = parent.open();
    expect(group.getSnapshot().active).toBe(tabOf(second.id));
    stop();
    expect(group.getSnapshot()).toEqual({ tabs: [], active: null });
    expect(parent.close).not.toHaveBeenCalled();
  });

  it("brings its tab forward when a question is asked from elsewhere", async () => {
    const { group, parent, tabOf } = fixture();
    const side = parent.open();
    await side.open();
    group.open(file("a.svg"));
    side.setDraft("Why?");
    const asking = side.ask();
    expect(group.getSnapshot().active).toBe(tabOf(side.id));
    await asking;
    group.activate(file("a.svg"));
    expect(group.getSnapshot().active).toBe(file("a.svg"));
  });
});
