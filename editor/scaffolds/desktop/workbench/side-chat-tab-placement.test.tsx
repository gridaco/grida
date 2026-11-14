import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorGroup } from "./editor-group";
import { SideChatPlacement } from "./side-chat-placement";
import type { NativeChatController } from "@/lib/agent-chat/native-chat-controller";
import {
  FakeSideChatParent,
  TitledSideChat,
  idleBridge,
} from "./side-chat-placement.fixtures";
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
    { bridge: idleBridge }
  );
  const tabOf = (id: string) =>
    WorkbenchTab.panel(SideChatTabPlacement.panel(id));
  return { group, panels, parent, stop, tabOf };
}

describe("SideChatTabPlacement", () => {
  it("opens a side chat as the focused Side chat tab showing the chat pane", () => {
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
    const html = renderToStaticMarkup(<>{panel.content}</>);
    expect(html).toContain('data-testid="native-side-chat"');
    expect(html).toContain('aria-label="Close side chat"');
    // The same transcript and composer as any chat, without choosing chats.
    expect(html).toContain('aria-label="Add to message"');
    expect(html).not.toContain('aria-label="Open chat list"');
    expect(html).not.toContain('aria-label="New chat"');
    expect(html).not.toContain('aria-label="Chat options"');
  });

  it("ends the side chat when its tab closes, and never reopens it", async () => {
    const { group, parent, tabOf } = fixture();
    group.open(file("a.svg"));
    const side = parent.open();
    group.close(tabOf(side.id));
    expect(parent.close).toHaveBeenCalledExactlyOnceWith(side.id);
    expect(group.getSnapshot()).toEqual({
      tabs: [file("a.svg")],
      active: file("a.svg"),
    });
    // Parent updates while the side chat is still closing keep the tab shut.
    parent.show(side.id);
    expect(group.getSnapshot().tabs).toEqual([file("a.svg")]);
    await vi.waitFor(() => expect(parent.read().sideChats).toEqual([]));
    group.reopenClosed();
    expect(group.getSnapshot().tabs).toEqual([file("a.svg")]);
    expect(parent.close).toHaveBeenCalledTimes(1);
  });

  it("gives each side chat its own tab, and closing one leaves the others", async () => {
    const { group, parent, tabOf } = fixture();
    group.open(file("a.svg"));
    const first = parent.open();
    const second = parent.open();
    expect(group.getSnapshot()).toEqual({
      tabs: [file("a.svg"), tabOf(first.id), tabOf(second.id)],
      active: tabOf(second.id),
    });
    group.close(tabOf(first.id));
    expect(parent.close).toHaveBeenCalledExactlyOnceWith(first.id);
    await vi.waitFor(() =>
      expect(parent.read().sideChats.map(({ id }) => id)).toEqual([second.id])
    );
    expect(group.getSnapshot().tabs).toEqual([file("a.svg"), tabOf(second.id)]);
  });

  it("closes its tab when the side chat ends from the parent", async () => {
    const { group, parent, tabOf } = fixture();
    group.open(file("a.svg"));
    const side = parent.open();
    const other = parent.open();
    group.activate(file("a.svg"));
    await parent.closeSideChat(side.id);
    expect(group.getSnapshot()).toEqual({
      tabs: [file("a.svg"), tabOf(other.id)],
      active: file("a.svg"),
    });
  });

  it("closes every side chat tab when the parent switches chats or disconnects", () => {
    const { group, parent, stop, tabOf } = fixture();
    const first = parent.open();
    const second = parent.open();
    parent.switchChat();
    expect(group.getSnapshot()).toEqual({ tabs: [], active: null });
    const third = parent.open();
    parent.open();
    expect(group.getSnapshot().tabs).not.toContain(tabOf(first.id));
    expect(group.getSnapshot().tabs).not.toContain(tabOf(second.id));
    expect(group.getSnapshot().tabs).toContain(tabOf(third.id));
    stop();
    expect(group.getSnapshot()).toEqual({ tabs: [], active: null });
    expect(parent.close).not.toHaveBeenCalled();
  });

  it("brings a tab forward when asked to show its side chat", () => {
    const { group, parent, tabOf } = fixture();
    const first = parent.open();
    const second = parent.open();
    group.open(file("a.svg"));
    expect(group.getSnapshot().active).toBe(file("a.svg"));
    parent.show(first.id);
    expect(group.getSnapshot()).toEqual({
      tabs: [tabOf(first.id), tabOf(second.id), file("a.svg")],
      active: tabOf(first.id),
    });
  });

  it("titles a tab Side chat until the side chat's title arrives", () => {
    const { group, panels, parent, stop, tabOf } = fixture();
    const titled = new TitledSideChat();
    const side = parent.open(titled as unknown as NativeChatController);
    group.open(file("a.svg"));
    const title = () =>
      panels.getSnapshot().get(SideChatTabPlacement.panel(side.id))?.title;
    expect(title()).toBe("Side chat");
    titled.arrive("Banner sizes");
    expect(title()).toBe("Banner sizes");
    // A title arriving moves no focus.
    expect(group.getSnapshot().active).toBe(file("a.svg"));
    expect(group.getSnapshot().tabs).toContain(tabOf(side.id));
    stop();
    expect(titled.listening).toBe(0);
  });
});
